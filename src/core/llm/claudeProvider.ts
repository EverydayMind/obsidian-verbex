import { Platform, requestUrl } from 'obsidian'

import { PROVIDER_DEFAULT_BASE_URLS } from '../../constants'
import { ChatModel } from '../../types/chat-model.types'
import {
  ContentPart,
  LLMOptions,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
  RequestToolChoice,
} from '../../types/llm/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
  ToolCall,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import {
  HttpRequestError,
  getJson,
  postJson,
  postStream,
} from '../../utils/llm/httpTransport'
import { parseJsonSseStream } from '../../utils/llm/sse'

import { BaseLLMProvider, ConnectionTestResult } from './base'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMRateLimitExceededException,
} from './exception'
import { ProviderModelListResult } from './modelDiscovery.types'

const ANTHROPIC_VERSION = '2023-06-01'
// Anthropic requires max_tokens on every request; use a sane default when the
// caller does not specify one.
const DEFAULT_MAX_TOKENS = 4096

// Prompt-caching marker (Anthropic Messages API, GA — no beta header needed).
// Marked prefixes are served at ~0.1x input cost on repeat calls.
type CacheControl = { type: 'ephemeral' }
const EPHEMERAL_CACHE: CacheControl = { type: 'ephemeral' }

type AnthropicTextBlock = {
  type: 'text'
  text: string
  cache_control?: CacheControl
}
type AnthropicToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}
type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'image'; source: Record<string, unknown> }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

type AnthropicToolChoice =
  | { type: 'none' }
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }

type AnthropicUsage = {
  input_tokens?: number
  output_tokens?: number
  // Present when prompt caching is active. These are billed input tokens too
  // (writes ~1.25x, reads ~0.1x), so they must be folded into the prompt count.
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

type AnthropicMessageResponse = {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: (AnthropicTextBlock | AnthropicToolUseBlock)[]
  stop_reason: string | null
  usage?: AnthropicUsage
}

type AnthropicStreamEvent = {
  type: string
  index?: number
  message?: { id?: string; model?: string; usage?: AnthropicUsage }
  content_block?: { type: string; id?: string; name?: string }
  delta?: {
    type?: string
    text?: string
    partial_json?: string
    stop_reason?: string | null
  }
  usage?: AnthropicUsage
}

type AnthropicModelsResponse = {
  data?: { id: string }[]
}

function mapStopReason(stopReason: string | null): string | null {
  switch (stopReason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop'
    case 'max_tokens':
      return 'length'
    case 'tool_use':
      return 'tool_calls'
    default:
      return stopReason
  }
}

function mapToolChoice(toolChoice: RequestToolChoice): AnthropicToolChoice {
  if (toolChoice === 'none') return { type: 'none' }
  if (toolChoice === 'auto') return { type: 'auto' }
  if (toolChoice === 'required') return { type: 'any' }
  return { type: 'tool', name: toolChoice.function.name }
}

/**
 * Provider client for the Anthropic Messages API (Claude). Unlike the other
 * providers, Claude does not speak the OpenAI Chat Completions wire format, so
 * this client maps the internal request/response shapes to and from
 * Anthropic's native `system` + content-block format, including tool use and
 * SSE streaming.
 */
export class ClaudeProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'claude' }>
> {
  constructor(provider: Extract<LLMProvider, { type: 'claude' }>) {
    super(provider)
  }

  private get baseUrl(): string {
    const trimmed = this.provider.baseUrl?.trim()
    const configured = trimmed ? trimmed : PROVIDER_DEFAULT_BASE_URLS.claude
    return configured.replace(/\/+$/, '')
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      // Allow browser-style requests (Obsidian webview) to reach the API.
      'anthropic-dangerous-direct-browser-access': 'true',
      ...(this.provider.apiKey ? { 'x-api-key': this.provider.apiKey } : {}),
    }
  }

  private get fetchFn(): typeof fetch | undefined {
    return Platform.isDesktop
      ? undefined
      : (...args: Parameters<typeof fetch>) => fetch(...args)
  }

  private ensureApiKey() {
    if (!this.provider.apiKey) {
      throw new LLMAPIKeyNotSetException(
        `Provider ${this.provider.id} API key is missing. Please set it in settings menu.`,
      )
    }
  }

  private wrapError(error: unknown): Error {
    if (!(error instanceof Error)) {
      return new Error('Unknown Anthropic API error')
    }
    const status = error instanceof HttpRequestError ? error.status : null
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

  private contentToBlocks(
    content: string | ContentPart[],
  ): AnthropicContentBlock[] {
    if (typeof content === 'string') {
      return content.length > 0 ? [{ type: 'text', text: content }] : []
    }
    const blocks: AnthropicContentBlock[] = []
    for (const part of content) {
      if (part.type === 'text') {
        if (part.text.length > 0) blocks.push({ type: 'text', text: part.text })
      } else if (part.type === 'image_url') {
        const url = part.image_url.url
        const dataMatch = /^data:([^;]+);base64,(.*)$/.exec(url)
        blocks.push({
          type: 'image',
          source: dataMatch
            ? {
                type: 'base64',
                media_type: dataMatch[1],
                data: dataMatch[2],
              }
            : { type: 'url', url },
        })
      }
    }
    return blocks
  }

  /**
   * Convert internal messages to Anthropic's format: system text is hoisted
   * out, tool results become user `tool_result` blocks, and consecutive
   * same-role messages are coalesced as Anthropic requires alternation.
   */
  private buildMessages(messages: RequestMessage[]): {
    system: string
    messages: AnthropicMessage[]
  } {
    const systemParts: string[] = []
    const result: AnthropicMessage[] = []

    const push = (
      role: 'user' | 'assistant',
      blocks: AnthropicContentBlock[],
    ) => {
      if (blocks.length === 0) return
      const last = result[result.length - 1]
      if (last && last.role === role) {
        last.content.push(...blocks)
      } else {
        result.push({ role, content: blocks })
      }
    }

    for (const message of messages) {
      switch (message.role) {
        case 'system': {
          if (typeof message.content === 'string' && message.content.trim()) {
            systemParts.push(message.content)
          }
          break
        }
        case 'user': {
          push('user', this.contentToBlocks(message.content))
          break
        }
        case 'assistant': {
          const blocks: AnthropicContentBlock[] = []
          if (typeof message.content === 'string' && message.content.length) {
            blocks.push({ type: 'text', text: message.content })
          }
          for (const toolCall of message.tool_calls ?? []) {
            blocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: safeParseJson(toolCall.arguments),
            })
          }
          push('assistant', blocks)
          break
        }
        case 'tool': {
          push('user', [
            {
              type: 'tool_result',
              tool_use_id: message.tool_call.id,
              content: message.content,
            },
          ])
          break
        }
      }
    }

    return { system: systemParts.join('\n\n'), messages: result }
  }

  private buildRequestBody(
    request: LLMRequestNonStreaming | LLMRequestStreaming,
    stream: boolean,
  ): Record<string, unknown> {
    const { system, messages } = this.buildMessages(request.messages)
    // Mark the largest stable prefixes with cache_control so Anthropic prompt
    // caching serves them at ~0.1x input cost on repeat calls. In the agentic
    // loop the system prompt + tool definitions + prior turns are re-sent on
    // every iteration; without these breakpoints each iteration re-bills the
    // full prefix at standard rates. Render order is tools -> system ->
    // messages, so the system breakpoint also caches the tools before it, and
    // the last-message breakpoint extends the cached span across the growing
    // transcript. Three breakpoints, under Anthropic's limit of four. Output is
    // identical with or without caching; only billing changes.
    const toolCount = request.tools?.length ?? 0
    const tools = request.tools?.map((tool, index) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
      ...(index === toolCount - 1 ? { cache_control: EPHEMERAL_CACHE } : {}),
    }))
    this.markLastBlockForCaching(messages)
    return {
      model: request.model,
      max_tokens: request.max_tokens ?? DEFAULT_MAX_TOKENS,
      messages,
      ...(system
        ? {
            system: [
              { type: 'text', text: system, cache_control: EPHEMERAL_CACHE },
            ],
          }
        : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.top_p !== undefined ? { top_p: request.top_p } : {}),
      ...(tools ? { tools } : {}),
      ...(tools && request.tool_choice
        ? { tool_choice: mapToolChoice(request.tool_choice) }
        : {}),
      ...(stream ? { stream: true } : {}),
    }
  }

  /**
   * Attach a cache breakpoint to the final content block of the conversation so
   * the cached prefix grows with the transcript across multi-turn / agentic
   * runs. Safe to mutate: {@link buildMessages} returns freshly built blocks.
   */
  private markLastBlockForCaching(messages: AnthropicMessage[]): void {
    const lastMessage = messages[messages.length - 1]
    const lastBlock = lastMessage?.content[lastMessage.content.length - 1]
    if (lastBlock) {
      ;(lastBlock as { cache_control?: CacheControl }).cache_control =
        EPHEMERAL_CACHE
    }
  }

  /**
   * Normalize Anthropic usage into the internal shape. Cached input tokens are
   * still billed input tokens, so fold cache reads/writes into prompt_tokens —
   * otherwise enabling caching would silently undercount prompt usage.
   */
  private toResponseUsage(usage?: AnthropicUsage) {
    if (!usage) return undefined
    const prompt_tokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    const completion_tokens = usage.output_tokens ?? 0
    return {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    }
  }

  async generateResponse(
    _model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    this.ensureApiKey()
    try {
      const response = await postJson<AnthropicMessageResponse>(
        `${this.baseUrl}/messages`,
        this.buildRequestBody(request, false),
        {
          headers: this.headers,
          signal: options?.signal,
          fetchFn: this.fetchFn,
          tls: this.getTlsOptions(),
        },
      )
      return this.parseNonStreamingResponse(response)
    } catch (error) {
      throw this.wrapError(error)
    }
  }

  private parseNonStreamingResponse(
    response: AnthropicMessageResponse,
  ): LLMResponseNonStreaming {
    const text = response.content
      .filter((block): block is AnthropicTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
    const toolCalls: ToolCall[] = response.content
      .filter(
        (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
      )
      .map((block) => ({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      }))
    return {
      id: response.id,
      choices: [
        {
          finish_reason: mapStopReason(response.stop_reason),
          message: {
            role: 'assistant',
            content: text.length > 0 ? text : null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      object: 'chat.completion',
      usage: this.toResponseUsage(response.usage),
    }
  }

  async streamResponse(
    _model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    this.ensureApiKey()
    try {
      const stream = await postStream(
        `${this.baseUrl}/messages`,
        this.buildRequestBody(request, true),
        {
          headers: this.headers,
          signal: options?.signal,
          fetchFn: this.fetchFn,
          tls: this.getTlsOptions(),
        },
      )
      return this.streamResponseGenerator(stream)
    } catch (error) {
      throw this.wrapError(error)
    }
  }

  private async *streamResponseGenerator(
    stream: Awaited<ReturnType<typeof postStream>>,
  ): AsyncIterable<LLMResponseStreaming> {
    let messageId = ''
    let model = ''
    let inputTokens = 0
    // Maps an Anthropic content-block index to the tool-call index we emit.
    const toolCallIndexByBlock = new Map<number, number>()
    let toolCallCount = 0

    for await (const event of parseJsonSseStream<AnthropicStreamEvent>(
      stream,
    )) {
      switch (event.type) {
        case 'message_start': {
          messageId = event.message?.id ?? messageId
          model = event.message?.model ?? model
          if (event.message?.usage) {
            // Includes cache read/write tokens, which are billed input tokens.
            inputTokens =
              (event.message.usage.input_tokens ?? 0) +
              (event.message.usage.cache_creation_input_tokens ?? 0) +
              (event.message.usage.cache_read_input_tokens ?? 0)
          }
          break
        }
        case 'content_block_start': {
          if (
            event.content_block?.type === 'tool_use' &&
            event.index !== undefined
          ) {
            const toolIndex = toolCallCount++
            toolCallIndexByBlock.set(event.index, toolIndex)
            yield this.streamChunk(messageId, model, {
              tool_calls: [
                {
                  index: toolIndex,
                  id: event.content_block.id,
                  type: 'function',
                  function: {
                    name: event.content_block.name,
                    arguments: '',
                  },
                },
              ],
            })
          }
          break
        }
        case 'content_block_delta': {
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield this.streamChunk(messageId, model, {
              content: event.delta.text,
            })
          } else if (
            event.delta?.type === 'input_json_delta' &&
            event.index !== undefined
          ) {
            const toolIndex = toolCallIndexByBlock.get(event.index)
            if (toolIndex !== undefined) {
              yield this.streamChunk(messageId, model, {
                tool_calls: [
                  {
                    index: toolIndex,
                    function: { arguments: event.delta.partial_json ?? '' },
                  },
                ],
              })
            }
          }
          break
        }
        case 'message_delta': {
          const outputTokens = event.usage?.output_tokens ?? 0
          yield {
            id: messageId,
            choices: [
              {
                finish_reason: mapStopReason(event.delta?.stop_reason ?? null),
                delta: {},
              },
            ],
            created: Math.floor(Date.now() / 1000),
            model,
            object: 'chat.completion.chunk',
            usage: {
              prompt_tokens: inputTokens,
              completion_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
            },
          }
          break
        }
        default:
          break
      }
    }
  }

  private streamChunk(
    id: string,
    model: string,
    delta: {
      content?: string
      tool_calls?: LLMResponseStreaming['choices'][number]['delta']['tool_calls']
    },
  ): LLMResponseStreaming {
    return {
      id,
      choices: [
        {
          finish_reason: null,
          delta: {
            role: 'assistant',
            content: delta.content ?? null,
            tool_calls: delta.tool_calls,
          },
        },
      ],
      created: Math.floor(Date.now() / 1000),
      model,
      object: 'chat.completion.chunk',
    }
  }

  async getEmbedding(
    _model: string,
    _text: string,
    _options?: { dimensions?: number; signal?: AbortSignal },
  ): Promise<number[]> {
    throw new Error(
      'Anthropic (Claude) does not provide an embeddings API. Configure a different embedding provider.',
    )
  }

  /**
   * List available models via `GET /v1/models`. Returns the raw entries
   * (source: 'remote'); normalization into settings identities happens at the
   * discovery boundary. Throws on failure so the settings UI can classify the
   * error and fall back to manual entry.
   */
  async listModels(options?: {
    signal?: AbortSignal
  }): Promise<ProviderModelListResult> {
    this.ensureApiKey()
    const tls = this.getTlsOptions()
    if (tls) {
      const json = await getJson<AnthropicModelsResponse>(
        `${this.baseUrl}/models`,
        {
          headers: this.headers,
          signal: options?.signal,
          tls,
        },
      )
      return { source: 'remote', models: json.data ?? [] }
    }
    const fetchFn = this.fetchFn
    if (fetchFn) {
      const response = await fetchFn(`${this.baseUrl}/models`, {
        headers: this.headers,
        signal: options?.signal,
      })
      if (!response.ok) {
        throw new HttpRequestError(
          response.status,
          await response.text().catch(() => undefined),
        )
      }
      const json = (await response.json()) as AnthropicModelsResponse
      return { source: 'remote', models: json.data ?? [] }
    }
    const response = await requestUrl({
      url: `${this.baseUrl}/models`,
      method: 'GET',
      headers: this.headers,
      throw: false,
    })
    if (response.status < 200 || response.status >= 300) {
      throw new HttpRequestError(response.status, response.text)
    }
    const json = response.json as AnthropicModelsResponse
    return { source: 'remote', models: json.data ?? [] }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.provider.apiKey) {
      return {
        ok: false,
        message: 'API key is not set. Enter an API key and try again.',
      }
    }
    try {
      if (this.getTlsOptions()) {
        try {
          const result = await this.listModels()
          const count = result.models.length
          return {
            ok: true,
            message: count
              ? `Connection succeeded. ${count} model(s) available.`
              : 'Connection succeeded.',
          }
        } catch (error) {
          if (error instanceof HttpRequestError) {
            return {
              ok: false,
              message:
                error.status === 401 || error.status === 403
                  ? 'Authentication failed (check API key).'
                  : `Connection failed with status ${error.status}.`,
            }
          }
          throw error
        }
      }
      const response = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: 'GET',
        headers: this.headers,
        throw: false,
      })
      if (response.status >= 200 && response.status < 300) {
        const count = (response.json as AnthropicModelsResponse)?.data?.length
        return {
          ok: true,
          message: count
            ? `Connection succeeded. ${count} model(s) available.`
            : 'Connection succeeded.',
        }
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Authentication failed (check API key).' }
      }
      return {
        ok: false,
        message: `Connection failed with status ${response.status}.`,
      }
    } catch (error) {
      return {
        ok: false,
        message: `Could not reach Anthropic API: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }
}

function safeParseJson(value: string | undefined): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
