import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

import type { ModelProfileRecommended, RecommendedField } from './modelProfiles'
import { OpenRouterEndpointsResult } from './openRouterEndpoints'
import { ToolCallProbeResult } from './toolCallProbe'

export const DIAGNOSTIC_RECOMMENDED_MAX_TOKENS = 1024
export const DIAGNOSTIC_SLOW_CLASSIFICATION_MS = 10_000
export const DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC = 20

const MIN_DEFAULT_REASONING_TOKENS = 300
const LOW_IGNORED_MIN_RATIO = 0.8
const MAX_TOKENS_EFFECTIVE_MAX_RATIO = 0.75
const MAX_TOKENS_EFFECTIVE_CEILING = 320

export type DiagnosticStepId =
  | 'tool_call'
  | 'reasoning_effort'
  | 'openrouter_max_tokens'
  | 'classification_latency'
  | 'openrouter_endpoints'

export type DiagnosticFormFields = ModelProfileRecommended & {
  readonly supportsTools?: RecommendedField<boolean>
}

export type DiagnosticReasoningProbe =
  | {
      readonly status: 'measured'
      readonly reasoningTokens: number
      readonly provider?: string
    }
  | { readonly status: 'unavailable'; readonly provider?: string }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'aborted' }

export type DiagnosticToolCallSection =
  | { readonly status: 'completed'; readonly result: ToolCallProbeResult }
  | { readonly status: 'aborted' }

export type DiagnosticReasoningComparisonSection = {
  readonly applicable: boolean
  readonly default?: DiagnosticReasoningProbe
  readonly none?: DiagnosticReasoningProbe
  readonly low?: DiagnosticReasoningProbe
}

export type DiagnosticOpenRouterMaxTokensSection =
  | DiagnosticReasoningProbe
  | { readonly status: 'not_applicable' }

export type DiagnosticClassificationSection =
  | {
      readonly status: 'measured'
      readonly durationMs: number
      readonly provider?: string
    }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'aborted' }

export type DiagnosticOpenRouterEndpointsSection =
  | OpenRouterEndpointsResult
  | { readonly status: 'not_applicable' }
  | { readonly status: 'aborted' }

export type ObservedProviderEntry = {
  readonly step: string
  readonly provider: string
}

export type DiagnosticSuggestionId =
  | 'low-ignored-use-max-tokens'
  | 'slow-classification-selection'
  | 'slow-classification-selection-timeout'
  | 'mixed-endpoint-tool-choice'
  | 'tool-call-failed-disable-tools'

export type DiagnosticSuggestion = {
  readonly id: DiagnosticSuggestionId
  readonly params: Readonly<Record<string, string | number>>
  readonly formValues: DiagnosticFormFields
}

export type ModelDiagnosticsReport = {
  readonly aborted: boolean
  readonly toolCall: DiagnosticToolCallSection
  readonly reasoningComparison: DiagnosticReasoningComparisonSection
  readonly openRouterMaxTokens: DiagnosticOpenRouterMaxTokensSection
  readonly classificationLatency: DiagnosticClassificationSection
  readonly openRouterEndpoints: DiagnosticOpenRouterEndpointsSection
  readonly observedProviders: readonly ObservedProviderEntry[]
  readonly suggestions: readonly DiagnosticSuggestion[]
  readonly suggestedFields: DiagnosticFormFields
}

export function isOpenAiCompatibleProviderType(
  type: ChatModel['providerType'],
): boolean {
  return (
    type === 'openai' ||
    type === 'openrouter' ||
    type === 'ollama' ||
    type === 'lmstudio' ||
    type === 'openai-compatible'
  )
}

export function evaluateDiagnosticSuggestions(input: {
  draft: ChatModel
  providerType: LLMProvider['type']
  toolCall: DiagnosticToolCallSection
  reasoningComparison: DiagnosticReasoningComparisonSection
  openRouterMaxTokens: DiagnosticOpenRouterMaxTokensSection
  classificationLatency: DiagnosticClassificationSection
  openRouterEndpoints: DiagnosticOpenRouterEndpointsSection
}): {
  suggestions: DiagnosticSuggestion[]
  suggestedFields: DiagnosticFormFields
} {
  const suggestions: DiagnosticSuggestion[] = []
  const openRouter = input.providerType === 'openrouter'
  const compat = isOpenAiCompatibleProviderType(input.draft.providerType)

  // Rule 1: low ignored (similar to default) while max_tokens 256 reduces tokens.
  if (
    openRouter &&
    input.reasoningComparison.default?.status === 'measured' &&
    input.reasoningComparison.low?.status === 'measured' &&
    input.openRouterMaxTokens.status === 'measured'
  ) {
    const defTokens = input.reasoningComparison.default.reasoningTokens
    const lowTokens = input.reasoningComparison.low.reasoningTokens
    const maxTokens = input.openRouterMaxTokens.reasoningTokens
    if (
      defTokens >= MIN_DEFAULT_REASONING_TOKENS &&
      lowTokens >= defTokens * LOW_IGNORED_MIN_RATIO &&
      maxTokens <= MAX_TOKENS_EFFECTIVE_CEILING &&
      maxTokens <= defTokens * MAX_TOKENS_EFFECTIVE_MAX_RATIO
    ) {
      suggestions.push({
        id: 'low-ignored-use-max-tokens',
        params: {
          defaultTokens: defTokens,
          lowTokens,
          maxTokens,
          recommendedMaxTokens: DIAGNOSTIC_RECOMMENDED_MAX_TOKENS,
        },
        formValues: {
          toolTurnReasoningEffort: { unset: true },
          openRouterReasoningMaxTokens: {
            value: DIAGNOSTIC_RECOMMENDED_MAX_TOKENS,
          },
        },
      })
    }
  }

  // Rule 2: short tool-free classification takes >= 10s.
  if (
    input.classificationLatency.status === 'measured' &&
    input.classificationLatency.durationMs >= DIAGNOSTIC_SLOW_CLASSIFICATION_MS
  ) {
    const seconds = (input.classificationLatency.durationMs / 1000).toFixed(1)
    if (compat) {
      suggestions.push({
        id: 'slow-classification-selection',
        params: {
          seconds,
          timeoutSec: DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC,
        },
        formValues: {
          selectionReasoningEffort: { value: 'none' },
          selectionTimeoutSec: {
            value: DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC,
          },
        },
      })
    } else {
      suggestions.push({
        id: 'slow-classification-selection-timeout',
        params: {
          seconds,
          timeoutSec: DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC,
        },
        formValues: {
          selectionTimeoutSec: {
            value: DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC,
          },
        },
      })
    }
  }

  // Rule 3: OpenRouter endpoints disagree on tool_choice support.
  if (openRouter && input.openRouterEndpoints.status === 'ok') {
    const known = input.openRouterEndpoints.endpoints.filter(
      (ep) => ep.supportsToolChoice !== undefined,
    )
    const supportedCount = known.filter((ep) => ep.supportsToolChoice).length
    if (supportedCount > 0 && supportedCount < known.length) {
      suggestions.push({
        id: 'mixed-endpoint-tool-choice',
        params: { supported: supportedCount, total: known.length },
        formValues: {
          openRouterAllowFallbacks: { unset: true },
        },
      })
    }
  }

  // Rule 4: the server rejected tools or did not structure the call. A single
  // no_call is inconclusive and an error (timeout, auth, network) says nothing
  // about tool support, so neither suggests turning tools off.
  if (
    input.toolCall.status === 'completed' &&
    (input.toolCall.result.kind === 'rejected' ||
      input.toolCall.result.kind === 'text_call')
  ) {
    suggestions.push({
      id: 'tool-call-failed-disable-tools',
      params: { kind: input.toolCall.result.kind },
      formValues: {
        supportsTools: { value: false },
      },
    })
  }

  let suggestedFields: DiagnosticFormFields = {}
  for (const suggestion of suggestions) {
    suggestedFields = { ...suggestedFields, ...suggestion.formValues }
  }
  return { suggestions, suggestedFields }
}
