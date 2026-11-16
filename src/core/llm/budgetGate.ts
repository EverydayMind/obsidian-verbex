import { RequestMessage } from '../../types/llm/request'
import { tokenCount } from '../../utils/llm/token'

import { type ObservedCall, beginObservedCall } from './callObservation'
import { ChatStepResult, RunChatStepInput, runChatStep } from './chatStep'
import {
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from './contextWindow'
import { getChatModelClient } from './manager'
import { resolveChatModelId } from './modelSelection'
import { TOOL_IMAGE_TOKEN_RESERVE, toolImageTokenInput } from './toolImages'
import { reportChatUsage } from './usageObserver'

export type GatedChatBlock = {
  message: RequestMessage
  /** Larger values are discarded first when optional context must shrink. */
  dropPriority?: number
}

export class ChatInputBudgetError extends Error {
  constructor(
    message: string,
    readonly kind: 'required_overflow' | 'split_required',
    readonly estimatedTokens: number,
    readonly inputBudget: number,
  ) {
    super(message)
    this.name = 'ChatInputBudgetError'
  }
}

export const DEFAULT_CHAT_INPUT_SAFETY_MARGIN_RATIO = 0.2

/** Share the final gate's safety margin with context assembly and preflight. */
export function chatMessageBudget(
  inputBudget: number,
  toolTokens: number,
): number {
  return Math.max(
    1,
    Math.floor(inputBudget / (1 + DEFAULT_CHAT_INPUT_SAFETY_MARGIN_RATIO)) -
      toolTokens,
  )
}

export type GatedChatStepInput = Omit<RunChatStepInput, 'messages'> & {
  diagnosticCallKind?: 'agent' | 'auxiliary'
  diagnosticReduced?: boolean
  requiredBlocks: RequestMessage[]
  optionalBlocks?: GatedChatBlock[]
  overflowStrategy?: 'split' | 'shrink_optional' | 'fail'
  /** Override for batch/map-reduce paths that already calculated a sub-budget. */
  inputBudget?: number
  /** Token-estimation slack. 0.2 means estimated tokens * 1.2 must fit. */
  safetyMarginRatio?: number
}

async function estimateRequestTokens(
  messages: RequestMessage[],
  input: GatedChatStepInput,
): Promise<number> {
  const messageTokens = await Promise.all(
    messages.map(async (message) => {
      const input = toolImageTokenInput(message)
      return (
        (await tokenCount(input.text)) + input.images * TOOL_IMAGE_TOKEN_RESERVE
      )
    }),
  )
  const toolTokens = input.tools?.length
    ? await tokenCount(JSON.stringify(input.tools))
    : 0
  return messageTokens.reduce((sum, count) => sum + count, 0) + toolTokens
}

function resolveInputBudget(input: GatedChatStepInput): number {
  if (input.inputBudget !== undefined) return Math.max(1, input.inputBudget)
  const resolved = resolveChatModelId({
    settings: input.settings,
    alias: input.alias,
    stepModel: input.stepModel,
  })
  const { model } = getChatModelClient({
    modelId: resolved.modelId,
    settings: input.settings,
  })
  const window = resolveContextWindow(model)
  const output =
    input.maxTokens ??
    computeOutputBudget(
      window,
      input.settings.verbex.context.reservedOutputTokens,
    )
  return computeInputBudget(window, output)
}

/**
 * Budget-aware facade over runChatStep. All runChatStep parameters are passed
 * through unchanged; only message assembly is centralized here.
 */
export async function gatedChatStep(
  input: GatedChatStepInput,
): Promise<ChatStepResult> {
  const call = beginObservedCall(input.options?.signal, {
    kind: input.diagnosticCallKind ?? 'auxiliary',
    reduced: input.diagnosticReduced === true,
    inputNames: input.tools?.map((tool) => tool.function.name) ?? [],
  })
  try {
    // Token counting is asynchronous. Pin the exact objects being counted so
    // callers cannot change the eventual request while the gate is waiting.
    const snapshot: GatedChatStepInput = {
      ...input,
      requiredBlocks: structuredClone(input.requiredBlocks),
      ...(input.optionalBlocks
        ? { optionalBlocks: structuredClone(input.optionalBlocks) }
        : {}),
      ...(input.tools ? { tools: structuredClone(input.tools) } : {}),
      ...(input.disclosureContext
        ? { disclosureContext: structuredClone(input.disclosureContext) }
        : {}),
    }
    const result = await gatedChatStepInner(snapshot, call)
    call?.success()
    return result
  } catch (error) {
    call?.failure(error)
    throw error
  }
}

async function gatedChatStepInner(
  input: GatedChatStepInput,
  call: ObservedCall | undefined,
): Promise<ChatStepResult> {
  const inputBudget = resolveInputBudget(input)
  const margin = Math.max(
    0,
    input.safetyMarginRatio ?? DEFAULT_CHAT_INPUT_SAFETY_MARGIN_RATIO,
  )
  const fits = (tokens: number) => tokens * (1 + margin) <= inputBudget
  const requiredTokens = await estimateRequestTokens(
    input.requiredBlocks,
    input,
  )
  if (!fits(requiredTokens)) {
    const kind =
      input.overflowStrategy === 'split'
        ? ('split_required' as const)
        : ('required_overflow' as const)
    throw new ChatInputBudgetError(
      `Required chat input is ~${requiredTokens} tokens and exceeds the ${inputBudget}-token input budget (safety margin ${Math.round(margin * 100)}%).`,
      kind,
      requiredTokens,
      inputBudget,
    )
  }

  const optional = [...(input.optionalBlocks ?? [])].sort(
    (a, b) => (a.dropPriority ?? 0) - (b.dropPriority ?? 0),
  )
  let messages = [
    ...input.requiredBlocks,
    ...optional.map((block) => block.message),
  ]
  let estimated = await estimateRequestTokens(messages, input)
  while (!fits(estimated) && optional.length > 0) {
    optional.pop()
    messages = [
      ...input.requiredBlocks,
      ...optional.map((block) => block.message),
    ]
    estimated = await estimateRequestTokens(messages, input)
  }
  if (!fits(estimated)) {
    throw new ChatInputBudgetError(
      `Chat input is ~${estimated} tokens and cannot fit after optional blocks were removed.`,
      input.overflowStrategy === 'split'
        ? 'split_required'
        : 'required_overflow',
      estimated,
      inputBudget,
    )
  }

  const {
    requiredBlocks: _requiredBlocks,
    optionalBlocks: _optionalBlocks,
    overflowStrategy: _overflowStrategy,
    inputBudget: _inputBudget,
    safetyMarginRatio: _safetyMarginRatio,
    diagnosticCallKind: _diagnosticCallKind,
    diagnosticReduced: _diagnosticReduced,
    ...chatInput
  } = input
  const result = await runChatStep({
    ...chatInput,
    messages,
    ...(call ? { callObservation: call } : {}),
  })
  reportChatUsage(chatInput.options?.signal, {
    usage: result.usage,
    estimated: result.usageEstimated,
  })
  return result
}
