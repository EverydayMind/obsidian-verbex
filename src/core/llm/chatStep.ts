import {
  DisclosureContext,
  assertAuthorizedProviderRequest,
  assertProviderRequestContext,
  authorizeProviderRequest,
  consumeAuthorizedProviderRequest,
  materializeAuthorizedMessages,
} from '../../security/promptInjectionBoundary'
import { VerbexSettings } from '../../settings/schema/setting.types'
import {
  LLMOptions,
  ReasoningEffort,
  RequestMessage,
  RequestTool,
  RequestToolChoice,
  ResponseFormat,
} from '../../types/llm/request'
import { ResponseUsage, ToolCall } from '../../types/llm/response'
import { ResponsesReplayState } from '../../types/llm/responses'
import { RetryOptions, withRetry } from '../../utils/llm/retry'
import { tokenCount } from '../../utils/llm/token'
import { toolArgsValid } from '../tools/parseToolArgs'

import { type ObservedCall, observedRetryOptions } from './callObservation'
import {
  DegenerateRepetitionDetector,
  REPETITION_NOTICE,
} from './degenerateRepetition'
import { getChatModelClient } from './manager'
import { ModelAlias, resolveChatModelId } from './modelSelection'
import { resolveOpenAIApiMode } from './openAIRequestPolicy'
import { assertNoResponsesReplay } from './responsesReplay'
import {
  TOOL_IMAGE_TOKEN_RESERVE,
  materializeToolImages,
  supportsBrowserImages,
} from './toolImages'
import { chatModelSupportsTools } from './toolSupport'

/**
 * Runs a single non-streaming chat completion for a workflow / ad-hoc step.
 *
 * Ties together the M4 pieces that a step needs:
 *  - model routing (alias / step `model` override -> resolveChatModelId)
 *  - the right provider client for that model
 *  - transient-failure retry (timeout / 429 / 5xx)
 *  - usage normalization, estimating tokens with tiktoken when the provider
 *    omits a usage block (flagged via `usageEstimated`)
 *
 * Streaming is handled directly by the provider clients / ChatView; steps use
 * the non-streaming path so the full draft is available for Diff + verification.
 */

export type ChatStepResult = {
  /** In-memory protocol state; never copy to ChatAssistantMessage. */
  responsesReplay?: ResponsesReplayState
  modelId: string
  /** Actual upstream provider reported by the server (e.g. OpenRouter). */
  provider?: string
  text: string
  reasoning: string | null
  toolCalls: ToolCall[]
  finishReason: string | null
  usage: ResponseUsage
  usageEstimated: boolean
  /** Non-fatal routing notices (e.g. an unconfigured step model). */
  warnings: string[]
}

export type RunChatStepInput = {
  /** Internal observation only; never sent to a provider. */
  callObservation?: ObservedCall
  onWireMessages?: (messages: RequestMessage[]) => void
  settings: VerbexSettings
  messages: RequestMessage[]
  alias?: ModelAlias
  stepModel?: string | null
  maxTokens?: number
  temperature?: number
  /** Tools exposed to the model for tool-calling (agentic loop). */
  tools?: RequestTool[]
  /** Optionally require or select a native tool call for this completion. */
  toolChoice?: RequestToolChoice
  /**
   * Constrain output to a JSON schema on OpenAI-compatible servers. Used by
   * deterministic triage calls so a small model can only emit a valid shape.
   */
  responseFormat?: ResponseFormat
  /**
   * Reasoning budget. Set to `'none'` to disable the thinking pass on triage
   * calls so a tiny model doesn't spend hundreds of tokens reasoning about a
   * one-line answer. Servers that don't support it ignore the field.
   */
  reasoningEffort?: ReasoningEffort
  options?: LLMOptions
  retry?: RetryOptions
  /** Streams visible text while still returning the complete parsed response. */
  onTextUpdate?: (text: string) => void
  /** Host-computed disclosure metadata for the final provider sink. */
  disclosureContext?: DisclosureContext
}

export async function estimateUsage(
  messages: RequestMessage[],
  text: string,
): Promise<ResponseUsage> {
  const promptParts = messages.map((message) => {
    if (message.role === 'assistant' && message.responsesReplay)
      return JSON.stringify(message.responsesReplay.items)
    return typeof message.content === 'string'
      ? message.content
      : message.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join('\n')
  })
  const promptCounts = await Promise.all(promptParts.map(tokenCount))
  const imageTokens = messages.reduce(
    (sum, message) =>
      sum +
      (message.role === 'tool' ? (message.images?.length ?? 0) : 0) *
        TOOL_IMAGE_TOKEN_RESERVE,
    0,
  )
  const prompt_tokens = promptCounts.reduce(
    (sum, count) => sum + count,
    imageTokens,
  )
  const completion_tokens = await tokenCount(text)
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  }
}

export async function runChatStep(
  input: RunChatStepInput,
): Promise<ChatStepResult> {
  const { settings, messages, alias, stepModel, options, retry } = input
  const disclosureContext = input.disclosureContext
    ? { ...input.disclosureContext }
    : undefined
  const resolved = resolveChatModelId({ settings, alias, stepModel })
  const warnings = resolved.warning ? [resolved.warning] : []

  const { providerClient, model } = getChatModelClient({
    modelId: resolved.modelId,
    settings,
  })
  if (
    !supportsBrowserImages(model) &&
    messages.some((m) => m.role === 'tool' && m.images?.length)
  )
    throw new Error('Browser image transmission is disabled for this model')
  options?.signal?.throwIfAborted()
  if (resolveOpenAIApiMode(model) !== 'responses')
    assertNoResponsesReplay(messages)
  const tools =
    chatModelSupportsTools({ settings, model }) &&
    input.tools &&
    input.tools.length > 0
      ? input.tools
      : undefined
  // Tool turns use the model-scoped policy because the caller's generic
  // reasoning option may be incompatible with function tools on this model.
  // Models without the OpenAI-compatible field keep the field omitted.
  const toolTurnReasoningEffort =
    tools && 'toolTurnReasoningEffort' in model
      ? model.toolTurnReasoningEffort
      : undefined
  const effectiveReasoningEffort = tools
    ? toolTurnReasoningEffort
    : input.reasoningEffort

  const authorized = await authorizeProviderRequest(
    materializeToolImages(
      resolveOpenAIApiMode(model) === 'responses'
        ? messages
        : messages.map((message) =>
            message.role === 'assistant' && message.tool_calls
              ? {
                  ...message,
                  tool_calls: message.tool_calls.map((call) =>
                    toolArgsValid(call.arguments)
                      ? call
                      : { ...call, arguments: '{}' },
                  ),
                }
              : message,
          ),
    ),
    disclosureContext && { ...disclosureContext },
  )
  assertProviderRequestContext(authorized, disclosureContext)
  const wireMessages = materializeAuthorizedMessages(authorized)
  const requestBase = {
    model: model.model,
    messages: wireMessages,
    ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    ...(input.temperature !== undefined
      ? { temperature: input.temperature }
      : {}),
    ...(tools ? { tools } : {}),
    ...(tools && input.toolChoice ? { tool_choice: input.toolChoice } : {}),
    ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    ...(effectiveReasoningEffort !== undefined
      ? { reasoning_effort: effectiveReasoningEffort }
      : {}),
  }
  consumeAuthorizedProviderRequest(authorized)

  const onTextUpdate = input.onTextUpdate
  const retryOptions = observedRetryOptions(retry, input.callObservation)
  if (onTextUpdate) {
    const streamed = await withRetry(async () => {
      input.callObservation?.startAttempt()
      await assertAuthorizedProviderRequest(authorized, wireMessages)
      input.onWireMessages?.(materializeAuthorizedMessages(authorized))
      input.callObservation?.sent(tools?.map((tool) => tool.function.name))
      const requestAbort = new AbortController()
      const forwardAbort = () => requestAbort.abort(options?.signal?.reason)
      options?.signal?.addEventListener('abort', forwardAbort, { once: true })
      if (options?.signal?.aborted) forwardAbort()
      try {
        const chunks = await providerClient.streamResponse(
          model,
          { ...requestBase, stream: true },
          { ...options, signal: requestAbort.signal },
        )
        let text = ''
        let reasoning = ''
        let finishReason: string | null = null
        let usage: ResponseUsage | undefined
        let provider: string | undefined
        let responsesReplay: ResponsesReplayState | undefined
        // A turn that emits a tool call is an intermediate agent step, not the
        // final answer — its prose must never settle in the answer bubble. Some
        // small/local models stream a full answer AND a tool call in one turn; if
        // we surfaced that prose it would flash as the answer and then get wiped
        // when the next turn (after the tool result) produces the real answer.
        // So once a tool call appears, stop streaming text and clear anything
        // already shown for this turn. The text is still accumulated into the
        // returned result so the assistant message keeps it in history.
        let toolCallSeen = false
        let displayedText = false
        const repetition = new DegenerateRepetitionDetector()
        const toolCalls = new Map<
          number,
          { id?: string; name: string; arguments: string }
        >()
        for await (const chunk of chunks) {
          if (chunk.usage) usage = chunk.usage
          if (chunk.provider) provider = chunk.provider
          const choice = chunk.choices[0]
          if (!choice) continue
          if (choice.delta.responsesReplay)
            responsesReplay = choice.delta.responsesReplay
          if (choice.finish_reason) finishReason = choice.finish_reason
          const toolDeltas = choice.delta.tool_calls ?? []
          if (toolDeltas.length > 0 && !toolCallSeen) {
            toolCallSeen = true
            if (displayedText) {
              onTextUpdate('')
              displayedText = false
            }
          }
          for (const toolDelta of toolDeltas) {
            const current = toolCalls.get(toolDelta.index) ?? {
              name: '',
              arguments: '',
            }
            if (toolDelta.id) current.id = toolDelta.id
            current.name += toolDelta.function?.name ?? ''
            current.arguments += toolDelta.function?.arguments ?? ''
            toolCalls.set(toolDelta.index, current)
          }
          const delta = choice.delta.content ?? ''
          if (delta) {
            text += delta
            if (!toolCallSeen) {
              onTextUpdate(text)
              displayedText = true
              if (repetition.add(delta)) {
                options?.signal?.throwIfAborted()
                requestAbort.abort()
                text += `\n\n${REPETITION_NOTICE()}`
                finishReason = 'degenerate_repetition'
                onTextUpdate(text)
                break
              }
            }
          }
          reasoning += choice.delta.reasoning ?? ''
        }
        return {
          text,
          reasoning,
          finishReason,
          usage,
          provider,
          toolCalls,
          responsesReplay,
        }
      } finally {
        options?.signal?.removeEventListener('abort', forwardAbort)
      }
    }, retryOptions)
    input.callObservation?.response()
    const usageEstimated = !streamed.usage
    return {
      modelId: resolved.modelId,
      ...(streamed.provider ? { provider: streamed.provider } : {}),
      text: streamed.text,
      reasoning: null, // raw reasoning 차단 정책 적용 (기본 raw 간주하여 폐기)
      toolCalls: [...streamed.toolCalls.values()]
        .filter((call) => call.name)
        .map((call) => ({
          ...(call.id ? { id: call.id } : {}),
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      finishReason: streamed.finishReason,
      usage: streamed.usage ?? (await estimateUsage(messages, streamed.text)),
      usageEstimated,
      warnings,
      ...(streamed.responsesReplay
        ? { responsesReplay: streamed.responsesReplay }
        : {}),
    }
  }

  const response = await withRetry(async () => {
    input.callObservation?.startAttempt()
    await assertAuthorizedProviderRequest(authorized, wireMessages)
    input.onWireMessages?.(materializeAuthorizedMessages(authorized))
    input.callObservation?.sent(tools?.map((tool) => tool.function.name))
    return providerClient.generateResponse(
      model,
      {
        ...requestBase,
        stream: false,
      },
      options,
    )
  }, retryOptions)
  input.callObservation?.response()

  const choice = response.choices[0]
  const originalText = choice?.message.content ?? ''
  const repeated =
    !choice?.message.tool_calls?.length &&
    new DegenerateRepetitionDetector().add(originalText)
  const text = repeated
    ? `${originalText}\n\n${REPETITION_NOTICE()}`
    : originalText
  const usageEstimated = !response.usage
  const usage = response.usage ?? (await estimateUsage(messages, text))

  return {
    modelId: resolved.modelId,
    ...(response.provider ? { provider: response.provider } : {}),
    text,
    reasoning: null, // raw reasoning 차단 정책 적용 (기본 raw 간주하여 폐기)
    toolCalls: choice?.message.tool_calls ?? [],
    finishReason: repeated
      ? 'degenerate_repetition'
      : (choice?.finish_reason ?? null),
    usage,
    usageEstimated,
    warnings,
    ...(choice?.message.responsesReplay
      ? { responsesReplay: choice.message.responsesReplay }
      : {}),
  }
}
