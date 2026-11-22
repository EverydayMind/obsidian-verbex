import { Platform, requestUrl } from 'obsidian'

import { verbexBuildRequestTag } from '../../buildInfo'
import { PROVIDER_DEFAULT_BASE_URLS } from '../../constants'
import { ChatModel } from '../../types/chat-model.types'
import {
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
  ToolCall,
  ToolCallDelta,
} from '../../types/llm/response'
import { ResponsesWireResponse } from '../../types/llm/responses'
import { LLMProvider } from '../../types/provider.types'
import {
  HttpRequestError,
  getJson,
  postJson,
  postStream,
} from '../../utils/llm/httpTransport'
import { formatMessages } from '../../utils/llm/request'
import { parseJsonSseStream } from '../../utils/llm/sse'

import { BaseLLMProvider, ConnectionTestResult } from './base'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMRateLimitExceededException,
} from './exception'
import {
  ProviderModelListEntry,
  ProviderModelListResult,
} from './modelDiscovery.types'
import {
  resolveOpenAIApiMode,
  resolveOpenAIRequest,
} from './openAIRequestPolicy'
import { assertNoResponsesReplay, responsesScope } from './responsesReplay'
import { buildResponsesRequest } from './responsesRequest'
import { normalizeResponsesResponse } from './responsesResponse'
import { decodeResponsesStream } from './responsesStream'

// Provider types that speak the OpenAI Chat Completions wire format. Gemini is
// included via Google's OpenAI-compatible endpoint
// (https://generativelanguage.googleapis.com/v1beta/openai).
type OpenAICompatibleType =
  | 'openai'
  | 'openrouter'
  | 'gemini'
  | 'ollama'
  | 'lmstudio'
  | 'openai-compatible'

type OpenAIChatCompletion = {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[] | null
    }
    finish_reason: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

type OpenAIChatCompletionChunk = {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string | null
      tool_calls?: ToolCallDelta[] | null
    }
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

type OpenAIEmbeddingResponse = {
  object: string
  data: { object: string; index?: number; embedding: number[] }[]
  model: string
}

type OpenAIModelsResponse = {
  data?: ProviderModelListEntry[]
}

/**
 * Provider client for OpenAI-compatible APIs: OpenAI, Ollama, LM Studio, and
 * generic OpenAI-compatible endpoints.
 *
 * M2A scope: basic non-streaming + streaming chat, embeddings, and a
 * `GET /v1/models` connection test. Multimodal / advanced options are
 * refined in M4.
 */
export class OpenAICompatibleProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: OpenAICompatibleType }>
> {
  constructor(provider: Extract<LLMProvider, { type: OpenAICompatibleType }>) {
    super(provider)
  }

  private get baseUrl(): string {
    // Empty / whitespace baseUrl falls back to the provider's default.
    const trimmed = this.provider.baseUrl?.trim()
    const configured = trimmed
      ? trimmed
      : PROVIDER_DEFAULT_BASE_URLS[this.provider.type]
    return configured.replace(/\/+$/, '')
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.provider.apiKey
        ? { Authorization: `Bearer ${this.provider.apiKey}` }
        : {}),
    }
  }

  // Obsidian mobile has no Node APIs; fall back to fetch there.
  private get fetchFn(): typeof fetch | undefined {
    return Platform.isDesktop
      ? undefined
      : (...args: Parameters<typeof fetch>) => fetch(...args)
  }

  private ensureBaseUrl() {
    if (!this.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing. Please set it in settings menu.`,
      )
    }
  }

  private ensureApiKeyIfRequired() {
    // openai / gemini require a key; ollama / lmstudio / generic
    // openai-compatible endpoints may be keyless.
    if (
      (this.provider.type === 'openai' ||
        this.provider.type === 'gemini' ||
        this.provider.type === 'openrouter') &&
      !this.provider.apiKey
    ) {
      throw new LLMAPIKeyNotSetException(
        `Provider ${this.provider.id} API key is missing. Please set it in settings menu.`,
      )
    }
  }

  /** The address a chat request for this model goes to. */
  private chatUrl(model: ChatModel): string {
    return `${this.baseUrl}/${
      resolveOpenAIApiMode(model) === 'responses'
        ? 'responses'
        : 'chat/completions'
    }`
  }

  private wrapError(error: unknown, model?: ChatModel): Error {
    if (!(error instanceof Error)) {
      return new Error(`Unknown ${this.provider.type} API error`)
    }
    const status = error instanceof HttpRequestError ? error.status : null
    if (error instanceof HttpRequestError && status === 404 && model) {
      // The server's own text ("Route not found") does not say which address
      // was called, and a wrong base URL is the usual cause.
      const hinted = new HttpRequestError(404, error.body, error.retryAfterMs)
      hinted.message = [
        error.message,
        `Called: ${this.chatUrl(model)}`,
        `Check the base URL of provider ${this.provider.id} in settings: it usually ends with /v1, and Verbex adds the rest.`,
        resolveOpenAIApiMode(model) === 'responses'
          ? "This model is set to the Responses API, which many compatible servers do not offer. If the server only has Chat Completions, change the model's API setting."
          : 'If the address is right, check that the model name exists on the server.',
      ].join('\n')
      return hinted
    }
    if (status === 401 || status === 403) {
      return new LLMAPIKeyInvalidException(
        `Provider ${this.provider.id} API key is invalid. Please update it in settings menu.`,
        error,
      )
    }
    if (status === 429) {
      return new LLMRateLimitExceededException(
        `Provider ${this.provider.id}: rate limit exceeded. Please try again later.`,
        error,
      )
    }
    return error
  }

  private ensureSupportedApiMode(model: ChatModel) {
    if (
      this.provider.type === 'openrouter' &&
      resolveOpenAIApiMode(model) === 'responses'
    ) {
      throw new Error(
        'OpenRouter supports Chat Completions only; Responses API is not supported.',
      )
    }
  }

  private parseRequestMessage(
    message: RequestMessage,
  ): Record<string, unknown> {
    switch (message.role) {
      case 'user': {
        const content = Array.isArray(message.content)
          ? message.content.map((part) =>
              part.type === 'text'
                ? { type: 'text', text: part.text }
                : { type: 'image_url', image_url: part.image_url },
            )
          : message.content
        return { role: 'user', content }
      }
      case 'assistant': {
        if (Array.isArray(message.content)) {
          throw new Error('Assistant message should be a string')
        }
        return {
          role: 'assistant',
          content: message.content,
          ...(message.tool_calls && message.tool_calls.length > 0
            ? {
                tool_calls: message.tool_calls.map((toolCall) => ({
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments: toolCall.arguments ?? '{}',
                  },
                })),
              }
            : {}),
        }
      }
      case 'system': {
        if (Array.isArray(message.content)) {
          throw new Error('System message should be a string')
        }
        return { role: 'system', content: message.content }
      }
      case 'tool': {
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.tool_call.id,
        }
      }
    }
  }

  private buildRequestBody(
    request: LLMRequestNonStreaming | LLMRequestStreaming,
    stream: boolean,
  ): Record<string, unknown> {
    // OpenAI's current Chat Completions contract uses
    // `max_completion_tokens`; keep the internal maxTokens/max_tokens
    // contract for the other OpenAI-compatible providers because local
    // servers do not uniformly accept the newer field.
    const maxTokensKey =
      this.provider.type === 'openai' ? 'max_completion_tokens' : 'max_tokens'
    return {
      model: request.model,
      user: verbexBuildRequestTag(),
      messages: formatMessages(request.messages).map((m) =>
        this.parseRequestMessage(m),
      ),
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.tool_choice ? { tool_choice: request.tool_choice } : {}),
      ...(request.response_format
        ? { response_format: request.response_format }
        : {}),
      ...(request.reasoning_effort !== undefined
        ? { reasoning_effort: request.reasoning_effort }
        : {}),
      ...(request.max_tokens !== undefined
        ? { [maxTokensKey]: request.max_tokens }
        : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.top_p !== undefined ? { top_p: request.top_p } : {}),
      ...(request.frequency_penalty !== undefined
        ? { frequency_penalty: request.frequency_penalty }
        : {}),
      ...(request.presence_penalty !== undefined
        ? { presence_penalty: request.presence_penalty }
        : {}),
      ...(stream ? { stream: true } : {}),
    }
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    this.ensureBaseUrl()
    this.ensureApiKeyIfRequired()
    this.ensureSupportedApiMode(model)

    try {
      options?.signal?.throwIfAborted()
      const resolvedRequest = resolveOpenAIRequest(model, request)
      if (resolveOpenAIApiMode(model) === 'responses') {
        const scope = await responsesScope(
          model,
          this.provider,
          request.messages,
        )
        const response = await postJson<ResponsesWireResponse>(
          `${this.baseUrl}/responses`,
          await buildResponsesRequest(resolvedRequest, false, scope),
          {
            headers: this.headers,
            signal: options?.signal,
            fetchFn: this.fetchFn,
            tls: this.getTlsOptions(),
            timeoutMs: options?.timeoutMs,
          },
        )
        options?.signal?.throwIfAborted()
        return normalizeResponsesResponse(response, scope)
      }
      assertNoResponsesReplay(request.messages)
      const response = await postJson<OpenAIChatCompletion>(
        `${this.baseUrl}/chat/completions`,
        this.buildRequestBody(resolvedRequest, false),
        {
          headers: this.headers,
          signal: options?.signal,
          fetchFn: this.fetchFn,
          tls: this.getTlsOptions(),
          timeoutMs: options?.timeoutMs,
        },
      )
      options?.signal?.throwIfAborted()
      return {
        id: response.id,
        choices: response.choices.map((choice) => ({
          finish_reason: choice.finish_reason,
          message: {
            content: choice.message.content,
            role: choice.message.role,
            tool_calls:
              choice.message.tool_calls && choice.message.tool_calls.length > 0
                ? choice.message.tool_calls
                : undefined,
          },
        })),
        created: response.created,
        model: response.model,
        object: 'chat.completion',
        usage: response.usage,
      }
    } catch (error) {
      throw this.wrapError(error, model)
    }
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    this.ensureBaseUrl()
    this.ensureApiKeyIfRequired()
    this.ensureSupportedApiMode(model)

    try {
      options?.signal?.throwIfAborted()
      const resolvedRequest = resolveOpenAIRequest(model, request)
      if (resolveOpenAIApiMode(model) === 'responses') {
        const scope = await responsesScope(
          model,
          this.provider,
          request.messages,
        )
        const stream = await postStream(
          `${this.baseUrl}/responses`,
          await buildResponsesRequest(resolvedRequest, true, scope),
          {
            headers: this.headers,
            signal: options?.signal,
            fetchFn: this.fetchFn,
            tls: this.getTlsOptions(),
            timeoutMs: options?.timeoutMs,
          },
        )
        return decodeResponsesStream(stream, scope, options)
      }
      assertNoResponsesReplay(request.messages)
      const stream = await postStream(
        `${this.baseUrl}/chat/completions`,
        this.buildRequestBody(resolvedRequest, true),
        {
          headers: this.headers,
          signal: options?.signal,
          fetchFn: this.fetchFn,
          tls: this.getTlsOptions(),
          timeoutMs: options?.timeoutMs,
        },
      )
      return this.streamResponseGenerator(stream)
    } catch (error) {
      throw this.wrapError(error, model)
    }
  }

  private async *streamResponseGenerator(
    stream: Awaited<ReturnType<typeof postStream>>,
  ): AsyncIterable<LLMResponseStreaming> {
    for await (const chunk of parseJsonSseStream<OpenAIChatCompletionChunk>(
      stream,
    )) {
      if (!chunk?.choices) {
        if (chunk && 'error' in chunk) {
          throw this.wrapError(
            new Error(`${this.provider.type} streaming API returned an error`),
          )
        }
        continue
      }
      yield {
        id: chunk.id,
        choices: chunk.choices.map((choice) => ({
          finish_reason: choice.finish_reason ?? null,
          delta: {
            content: choice.delta.content ?? null,
            role: choice.delta.role,
            tool_calls: choice.delta.tool_calls ?? undefined,
          },
        })),
        created: chunk.created,
        model: chunk.model,
        object: 'chat.completion.chunk',
        usage: chunk.usage ?? undefined,
      }
    }
  }

  async getEmbedding(
    model: string,
    text: string,
    options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<number[]> {
    const response = await this.postEmbeddings(model, text, options)
    const embedding = response.data?.[0]?.embedding
    if (!Array.isArray(embedding)) {
      throw new Error(
        `${this.provider.type} embeddings API returned invalid data`,
      )
    }
    return embedding
  }

  async getEmbeddings(
    model: string,
    texts: string[],
    options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return []
    }

    const response = await this.postEmbeddings(model, texts, options)
    if (
      !Array.isArray(response.data) ||
      response.data.length !== texts.length
    ) {
      throw new Error(
        `${this.provider.type} embeddings API returned invalid data`,
      )
    }

    const data = [...response.data].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    )
    const embeddings = data.map((item) => item.embedding)
    if (!embeddings.every((embedding) => Array.isArray(embedding))) {
      throw new Error(
        `${this.provider.type} embeddings API returned invalid data`,
      )
    }
    return embeddings
  }

  private async postEmbeddings(
    model: string,
    input: string | string[],
    options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<OpenAIEmbeddingResponse> {
    this.ensureBaseUrl()
    this.ensureApiKeyIfRequired()

    try {
      return await postJson<OpenAIEmbeddingResponse>(
        `${this.baseUrl}/embeddings`,
        {
          input,
          model,
          encoding_format: 'float',
          ...(options?.dimensions ? { dimensions: options.dimensions } : {}),
        },
        {
          headers: this.headers,
          fetchFn: this.fetchFn,
          tls: this.getTlsOptions(),
          signal: options?.signal,
        },
      )
    } catch (error) {
      throw this.wrapError(error)
    }
  }

  /**
   * Auto-discover models. Ollama exposes a richer `GET /api/tags`; OpenAI /
   * LM Studio / generic endpoints use `GET /v1/models`. The OpenAI-compatible
   * `${baseUrl}/models` works for Ollama too, but we prefer `/api/tags` there
   * because it is always present even when the OpenAI shim is partial.
   * Raw entries are returned as-is (source: 'remote'); normalization into
   * settings identities happens at the discovery boundary, not here.
   */
  async listModels(options?: {
    signal?: AbortSignal
  }): Promise<ProviderModelListResult> {
    this.ensureBaseUrl()
    this.ensureApiKeyIfRequired()
    if (this.provider.type === 'ollama') {
      return this.listOllamaModels(options?.signal)
    }
    const response = await this.getJson<OpenAIModelsResponse>(
      `${this.baseUrl}/models`,
      options?.signal,
    )
    return { source: 'remote', models: response.data ?? [] }
  }

  private async listOllamaModels(
    signal?: AbortSignal,
  ): Promise<ProviderModelListResult> {
    // Ollama's native endpoint lives at the host root, not under /v1.
    const root = this.baseUrl.replace(/\/v1$/, '')
    try {
      const response = await this.getJson<{ models?: { name: string }[] }>(
        `${root}/api/tags`,
        signal,
      )
      const tags = (response.models ?? [])
        .filter(
          (model): model is { name: string } =>
            typeof model?.name === 'string' && model.name.trim().length > 0,
        )
        .map((model) => ({ id: model.name }))
      if (tags.length > 0) {
        return { source: 'remote', models: tags }
      }
      // Structurally valid but empty: fall through to /models below, which
      // may still answer (e.g. an OpenAI-compatible shim in front).
    } catch (error) {
      // Only a genuine "endpoint not present" (404/405) justifies falling
      // back to /models. Auth/rate-limit/server/network errors describe the
      // real problem and must not be papered over by a second endpoint.
      const status = error instanceof HttpRequestError ? error.status : null
      if (status !== 404 && status !== 405) {
        throw error
      }
    }
    const response = await this.getJson<OpenAIModelsResponse>(
      `${this.baseUrl}/models`,
      signal,
    )
    return { source: 'remote', models: response.data ?? [] }
  }

  private async getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    return getJson<T>(url, {
      headers: this.headers,
      signal,
      fetchFn: this.fetchFn,
      tls: this.getTlsOptions(),
    })
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.baseUrl) {
      return {
        ok: false,
        message: 'Base URL is not set. Enter a base URL and try again.',
      }
    }
    if (
      (this.provider.type === 'openai' ||
        this.provider.type === 'gemini' ||
        this.provider.type === 'openrouter') &&
      !this.provider.apiKey
    ) {
      return {
        ok: false,
        message: 'API key is not set. Enter an API key and try again.',
      }
    }

    const url = `${this.baseUrl}/models`
    try {
      const tls = this.getTlsOptions()
      if (tls) {
        try {
          const response = await getJson<OpenAIModelsResponse>(url, {
            headers: this.headers,
            tls,
          })
          return this.interpretModelsStatus(
            200,
            async () => response.data?.length ?? 0,
          )
        } catch (error) {
          if (error instanceof HttpRequestError) {
            return this.interpretModelsStatus(error.status, async () => 0)
          }
          throw error
        }
      }
      const fetchFn = this.fetchFn
      if (fetchFn) {
        const response = await fetchFn(url, { headers: this.headers })
        return this.interpretModelsStatus(response.status, async () => {
          const json = (await response.json()) as OpenAIModelsResponse
          return json.data?.length ?? 0
        })
      }
      const response = await requestUrl({
        url,
        method: 'GET',
        headers: this.headers,
        throw: false,
      })
      return this.interpretModelsStatus(response.status, () =>
        Promise.resolve(
          (response.json as OpenAIModelsResponse)?.data?.length ?? 0,
        ),
      )
    } catch (error) {
      return {
        ok: false,
        message: `Could not reach ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  private async interpretModelsStatus(
    status: number,
    countModels: () => Promise<number>,
  ): Promise<ConnectionTestResult> {
    if (status >= 200 && status < 300) {
      const count = await countModels().catch(() => 0)
      return {
        ok: true,
        message: count
          ? `Connection succeeded. ${count} model(s) available.`
          : 'Connection succeeded.',
      }
    }
    if (status === 401 || status === 403) {
      return { ok: false, message: 'Authentication failed (check API key).' }
    }
    if (status === 404) {
      // Server reachable but no /models endpoint — still a valid connection.
      return {
        ok: true,
        message:
          'Server reachable, but /models is not available. Credentials look valid.',
      }
    }
    return { ok: false, message: `Connection failed with status ${status}.` }
  }
}
