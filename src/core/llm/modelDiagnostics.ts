import { VerbexSettings } from '../../settings/schema/setting.types'
import {
  ChatModel,
  OpenRouterReasoningPreferences,
} from '../../types/chat-model.types'
import {
  ReasoningEffort,
  RequestMessage,
  RequestTool,
} from '../../types/llm/request'
import { LLMProvider } from '../../types/provider.types'
import { isAbortError } from '../../utils/llm/retry'

import { gatedChatStep } from './budgetGate'
import type { ChatStepResult } from './chatStep'
import {
  DiagnosticClassificationSection,
  DiagnosticOpenRouterEndpointsSection,
  DiagnosticOpenRouterMaxTokensSection,
  DiagnosticReasoningComparisonSection,
  DiagnosticReasoningProbe,
  DiagnosticStepId,
  DiagnosticToolCallSection,
  ModelDiagnosticsReport,
  ObservedProviderEntry,
  evaluateDiagnosticSuggestions,
  isOpenAiCompatibleProviderType,
} from './modelDiagnosticsRules'
import { OpenAICompatibleProvider } from './openAICompatibleProvider'
import { OpenRouterEndpointsResult } from './openRouterEndpoints'
import { probeToolCall } from './toolCallProbe'

export type {
  DiagnosticClassificationSection,
  DiagnosticFormFields,
  DiagnosticOpenRouterEndpointsSection,
  DiagnosticOpenRouterMaxTokensSection,
  DiagnosticReasoningComparisonSection,
  DiagnosticReasoningProbe,
  DiagnosticStepId,
  DiagnosticSuggestion,
  DiagnosticSuggestionId,
  DiagnosticToolCallSection,
  ModelDiagnosticsReport,
  ObservedProviderEntry,
} from './modelDiagnosticsRules'
export {
  DIAGNOSTIC_RECOMMENDED_MAX_TOKENS,
  DIAGNOSTIC_RECOMMENDED_SELECTION_TIMEOUT_SEC,
  DIAGNOSTIC_SLOW_CLASSIFICATION_MS,
  evaluateDiagnosticSuggestions,
} from './modelDiagnosticsRules'

export const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 30_000
export const DIAGNOSTIC_OPENROUTER_PROBE_MAX_TOKENS = 256

const DIAGNOSTIC_MODEL_ID = 'verbex-diagnostic-model'

export type ModelDiagnosticsDeps = {
  runStep?: typeof gatedChatStep
  fetchOpenRouterEndpoints?: (
    provider: LLMProvider,
    modelName: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ) => Promise<OpenRouterEndpointsResult>
  now?: () => number
}

export type RunModelDiagnosticsInput = {
  draft: ChatModel
  provider: LLMProvider
  settings: VerbexSettings
  signal?: AbortSignal
  timeoutMs?: number
  onStepChange?: (step: DiagnosticStepId) => void
  deps?: ModelDiagnosticsDeps
}

const REASONING_PROBE_TOOL: RequestTool = {
  type: 'function',
  function: {
    name: 'verbex_diag_report',
    description: 'Report the computed answer.',
    parameters: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    },
  },
}

const REASONING_PROBE_BLOCKS: RequestMessage[] = [
  {
    role: 'system',
    content:
      'Solve the problem carefully and report the result by calling verbex_diag_report.',
  },
  {
    role: 'user',
    content:
      'A schedule has 3 tasks: A takes 15 minutes, B takes twice A, and C takes 10 minutes less than B. Compute the total minutes and call verbex_diag_report with the answer.',
  },
]

const CLASSIFICATION_BLOCKS: RequestMessage[] = [
  {
    role: 'system',
    content:
      'Classify the user request into one label from [note, summary, search, other]. Reply with only the single label.',
  },
  {
    role: 'user',
    content: 'Summarize the key points of yesterday meeting notes.',
  },
]

export function makeIsolatedProbeModel(
  draft: ChatModel,
  provider: LLMProvider,
  overrides: {
    supportsTools?: boolean
    toolTurnReasoningEffort?: ReasoningEffort
    openRouterReasoning?: OpenRouterReasoningPreferences
  },
): ChatModel {
  const clone: Record<string, unknown> = {
    ...draft,
    id: DIAGNOSTIC_MODEL_ID,
    providerId: provider.id,
  }
  delete clone.toolTurnReasoningEffort
  delete clone.selectionReasoningEffort
  delete clone.openRouterReasoning

  if (overrides.supportsTools !== undefined) {
    clone.supportsTools = overrides.supportsTools
  }
  if (
    overrides.toolTurnReasoningEffort !== undefined &&
    isOpenAiCompatibleProviderType(draft.providerType)
  ) {
    clone.toolTurnReasoningEffort = overrides.toolTurnReasoningEffort
  }
  if (
    overrides.openRouterReasoning !== undefined &&
    provider.type === 'openrouter'
  ) {
    clone.openRouterReasoning = { ...overrides.openRouterReasoning }
  }
  return clone as ChatModel
}

function makeProbeSettings(
  settings: VerbexSettings,
  provider: LLMProvider,
  probeModel: ChatModel,
): VerbexSettings {
  return {
    ...settings,
    providers: [provider],
    chatModels: [probeModel],
  }
}

function formatErrorMessage(error: unknown): string {
  const raw: unknown =
    error instanceof Error &&
    'rawError' in error &&
    error.rawError instanceof Error
      ? error.rawError
      : error
  return (raw instanceof Error ? raw.message : String(raw)).slice(0, 300)
}

function extractReasoningTokens(result: ChatStepResult): number | undefined {
  if (result.usageEstimated) return undefined
  const tokens = result.usage.completion_tokens_details?.reasoning_tokens
  return typeof tokens === 'number' && Number.isFinite(tokens)
    ? tokens
    : undefined
}

async function defaultFetchOpenRouterEndpoints(
  provider: LLMProvider,
  modelName: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<OpenRouterEndpointsResult> {
  if (provider.type !== 'openrouter') {
    return { status: 'unavailable', reason: 'not_openrouter' }
  }
  return new OpenAICompatibleProvider(provider).listOpenRouterModelEndpoints(
    modelName,
    options,
  )
}

export async function runModelDiagnostics(
  input: RunModelDiagnosticsInput,
): Promise<ModelDiagnosticsReport> {
  const {
    draft,
    provider,
    settings,
    signal,
    timeoutMs = DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
    onStepChange,
    deps,
  } = input
  const runStep = deps?.runStep ?? gatedChatStep
  const fetchEndpoints =
    deps?.fetchOpenRouterEndpoints ?? defaultFetchOpenRouterEndpoints
  const now = deps?.now ?? (() => Date.now())

  const isOpenRouter = provider.type === 'openrouter'
  const isCompat = isOpenAiCompatibleProviderType(draft.providerType)

  let aborted = false
  let toolCall: DiagnosticToolCallSection = { status: 'aborted' }
  let reasoningComparison: DiagnosticReasoningComparisonSection = {
    applicable: isCompat,
  }
  let openRouterMaxTokens: DiagnosticOpenRouterMaxTokensSection = isOpenRouter
    ? { status: 'aborted' }
    : { status: 'not_applicable' }
  let classificationLatency: DiagnosticClassificationSection = {
    status: 'aborted',
  }
  let openRouterEndpoints: DiagnosticOpenRouterEndpointsSection = isOpenRouter
    ? { status: 'aborted' }
    : { status: 'not_applicable' }
  const observedProviders: ObservedProviderEntry[] = []

  const recordProvider = (step: string, value: string | undefined) => {
    if (value) observedProviders.push({ step, provider: value })
  }

  const runReasoningProbe = async (
    stepLabel: string,
    overrides: {
      toolTurnReasoningEffort?: ReasoningEffort
      openRouterReasoning?: OpenRouterReasoningPreferences
    },
  ): Promise<DiagnosticReasoningProbe> => {
    const probeModel = makeIsolatedProbeModel(draft, provider, {
      supportsTools: true,
      ...overrides,
    })
    try {
      const result = await runStep({
        settings: makeProbeSettings(settings, provider, probeModel),
        stepModel: probeModel.id,
        requiredBlocks: REASONING_PROBE_BLOCKS,
        tools: [REASONING_PROBE_TOOL],
        retry: { numOfAttempts: 1 },
        options: { signal, timeoutMs },
      })
      recordProvider(stepLabel, result.provider)
      const reasoningTokens = extractReasoningTokens(result)
      if (reasoningTokens !== undefined) {
        return {
          status: 'measured',
          reasoningTokens,
          ...(result.provider ? { provider: result.provider } : {}),
        }
      }
      return {
        status: 'unavailable',
        ...(result.provider ? { provider: result.provider } : {}),
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        aborted = true
        return { status: 'aborted' }
      }
      return { status: 'error', message: formatErrorMessage(error) }
    }
  }

  const finalize = (): ModelDiagnosticsReport => {
    const { suggestions, suggestedFields } = evaluateDiagnosticSuggestions({
      draft,
      providerType: provider.type,
      toolCall,
      reasoningComparison,
      openRouterMaxTokens,
      classificationLatency,
      openRouterEndpoints,
    })
    return {
      aborted,
      toolCall,
      reasoningComparison,
      openRouterMaxTokens,
      classificationLatency,
      openRouterEndpoints,
      observedProviders,
      suggestions,
      suggestedFields,
    }
  }

  const isAbortedNow = (): boolean => {
    if (aborted || signal?.aborted) {
      aborted = true
      return true
    }
    return false
  }

  // Step 1: Structured tool call (reusing toolCallProbe.ts)
  if (isAbortedNow()) return finalize()
  onStepChange?.('tool_call')
  try {
    const probeModel = makeIsolatedProbeModel(draft, provider, {
      supportsTools: true,
    })
    const probeResult = await probeToolCall(provider, probeModel, settings, {
      signal,
      timeoutMs,
      runStep,
    })
    if ('provider' in probeResult) {
      recordProvider('tool_call', probeResult.provider)
    }
    toolCall = { status: 'completed', result: probeResult }
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      aborted = true
      return finalize()
    }
    toolCall = {
      status: 'completed',
      result: { kind: 'error', message: formatErrorMessage(error) },
    }
  }

  // Step 2: Tool-turn reasoning_effort default / none / low comparison
  if (isCompat) {
    if (isAbortedNow()) return finalize()
    onStepChange?.('reasoning_effort')
    const defaultProbe = await runReasoningProbe('reasoning_default', {})
    reasoningComparison = { ...reasoningComparison, default: defaultProbe }
    if (isAbortedNow()) return finalize()

    const noneProbe = await runReasoningProbe('reasoning_none', {
      toolTurnReasoningEffort: 'none',
    })
    reasoningComparison = { ...reasoningComparison, none: noneProbe }
    if (isAbortedNow()) return finalize()

    const lowProbe = await runReasoningProbe('reasoning_low', {
      toolTurnReasoningEffort: 'low',
    })
    reasoningComparison = { ...reasoningComparison, low: lowProbe }
    if (isAbortedNow()) return finalize()
  }

  // Step 3: OpenRouter reasoning.max_tokens = 256 comparison
  if (isOpenRouter) {
    if (isAbortedNow()) return finalize()
    onStepChange?.('openrouter_max_tokens')
    openRouterMaxTokens = await runReasoningProbe('openrouter_max_tokens', {
      openRouterReasoning: {
        maxTokens: DIAGNOSTIC_OPENROUTER_PROBE_MAX_TOKENS,
      },
    })
    if (isAbortedNow()) return finalize()
  }

  // Step 4: Short tool-free classification latency
  if (isAbortedNow()) return finalize()
  onStepChange?.('classification_latency')
  {
    const probeModel = makeIsolatedProbeModel(draft, provider, {
      supportsTools: false,
    })
    const startedAt = now()
    try {
      const result = await runStep({
        settings: makeProbeSettings(settings, provider, probeModel),
        stepModel: probeModel.id,
        requiredBlocks: CLASSIFICATION_BLOCKS,
        retry: { numOfAttempts: 1 },
        options: { signal, timeoutMs },
      })
      const durationMs = Math.max(0, now() - startedAt)
      recordProvider('classification_latency', result.provider)
      classificationLatency = {
        status: 'measured',
        durationMs,
        ...(result.provider ? { provider: result.provider } : {}),
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        aborted = true
        return finalize()
      }
      classificationLatency = {
        status: 'error',
        message: formatErrorMessage(error),
      }
    }
  }

  // Step 5: OpenRouter endpoints lookup
  if (isOpenRouter) {
    if (isAbortedNow()) return finalize()
    onStepChange?.('openrouter_endpoints')
    try {
      openRouterEndpoints = await fetchEndpoints(provider, draft.model, {
        signal,
        timeoutMs,
      })
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        aborted = true
        return finalize()
      }
      openRouterEndpoints = {
        status: 'error',
        message: formatErrorMessage(error),
      }
    }
  }

  return finalize()
}
