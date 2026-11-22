import type { AssembledAgentRequest } from './agentCompletionRequest'
import { estimateRequestTokens, gatedChatStep } from './core/llm/budgetGate'
import { getChatModelClient } from './core/llm/manager'
import type { VerbexSettings } from './settings/schema/setting.types'

export type AgentRequestLimits = {
  maxCalls: number
  maxInputTokens: number
  maxOutputTokens: number
}

/** Reserve the worst-case token budget for every allowed attempt before sending. */
export async function sendAgentRequestOnce(
  settings: VerbexSettings,
  raw: AssembledAgentRequest,
  limits: AgentRequestLimits,
) {
  const request = structuredClone(raw)
  limits = structuredClone(limits)
  settings = structuredClone(settings)
  getChatModelClient({ modelId: request.modelId, settings })
  for (const value of [
    limits.maxCalls,
    limits.maxInputTokens,
    limits.maxOutputTokens,
  ])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Limits must be positive safe integers')
  if (!Number.isSafeInteger(request.maxTokens) || request.maxTokens <= 0)
    throw new Error('Request must have an output token limit')
  const estimatedInput = await estimateRequestTokens(request.messages, {
    settings,
    requiredBlocks: request.messages,
    tools: request.tools,
  })
  if (
    estimatedInput * limits.maxCalls > limits.maxInputTokens ||
    request.maxTokens * limits.maxCalls > limits.maxOutputTokens
  )
    throw new Error('Request exceeds the token limit including retries')
  let retries = 0
  const result = await gatedChatStep({
    settings,
    stepModel: request.modelId,
    requiredBlocks: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    inputBudget: request.inputBudget,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    disclosureContext: request.disclosureContext,
    diagnosticCallKind: 'agent',
    retry: {
      numOfAttempts: limits.maxCalls,
      onRetry: () => {
        retries += 1
      },
    },
  })
  return {
    text: result.text,
    tool_calls: result.toolCalls,
    finish_reason: result.finishReason,
    usage: result.usage,
    usageEstimated: result.usageEstimated,
    provider: settings.chatModels.find((model) => model.id === result.modelId)
      ?.providerId,
    retries,
  }
}
