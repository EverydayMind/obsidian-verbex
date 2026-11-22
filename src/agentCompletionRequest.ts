import type { AgentRunInput } from './AgentRunExecution'
import { fitMessagesToTokenBudget } from './context/requestPreflight'
import type { AgentCompletionDirective } from './core/llm/agentLoop'
import { chatMessageBudget } from './core/llm/budgetGate'
import {
  agentToolRoutingText,
  selectAgentToolDefinitions,
} from './core/tools/toolDefinitions'
import { directiveToolDefinitions } from './provider/directiveToolDefinitions'
import type { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import type { ChatModel } from './types/chat-model.types'
import type {
  RequestMessage,
  RequestTool,
  RequestToolChoice,
} from './types/llm/request'
import { tokenCount } from './utils/llm/token'

export type AssembledAgentRequest = {
  modelId: string
  messages: RequestMessage[]
  tools: RequestTool[]
  inputBudget: number
  maxTokens: number
  temperature?: number
  toolChoice?: RequestToolChoice
  disclosureContext: {
    runId: string
    turnId: string
    approvedConnectorVaultRead: boolean
  }
}

/** The last selection and fitting step, shared by live turns and dry assembly. */
export async function prepareAgentCompletion(input: {
  input: AgentRunInput
  model: ChatModel
  prepared: Awaited<ReturnType<typeof prepareAgentProviderTools>>
  toolsEnabled: boolean
  intentRequest: string
  scopeDecision: Parameters<typeof selectAgentToolDefinitions>[3]
  messages: RequestMessage[]
  directive?: AgentCompletionDirective
  inputBudget: number
  outputBudget: number
  temperature?: number
  onExposure?: (tools: RequestTool[], definitionTokens: number) => void
}) {
  const { model, prepared, messages, directive } = input
  const turnToolDefinitions = input.toolsEnabled
    ? await prepared.withProviderTools(
        selectAgentToolDefinitions(
          agentToolRoutingText(input.intentRequest, messages),
          model.promptLevel,
          input.input.activeSkills,
          input.scopeDecision,
        ),
      )
    : []
  const { canonicalSelectedName, selectedTools } =
    await directiveToolDefinitions(
      directive?.selectedToolName,
      turnToolDefinitions,
      prepared.projectTools,
    )
  const definitionTokens = await tokenCount(JSON.stringify(selectedTools))
  input.onExposure?.(selectedTools, definitionTokens)
  const messageInputBudget = chatMessageBudget(
    input.inputBudget,
    definitionTokens,
  )
  const fitted = await fitMessagesToTokenBudget(messages, messageInputBudget)
  messages.splice(0, messages.length, ...fitted.messages)
  const request: AssembledAgentRequest = {
    modelId: model.id,
    messages,
    tools: selectedTools,
    inputBudget: input.inputBudget,
    maxTokens: input.outputBudget,
    temperature: input.temperature,
    ...(directive?.requireToolCall ? { toolChoice: 'required' } : {}),
    disclosureContext: {
      runId: input.input.runId,
      turnId: prepared.providerTurnId,
      approvedConnectorVaultRead: prepared.approvedConnectorVaultRead,
    },
  }
  return { request, canonicalSelectedName, messageInputBudget, selectedTools }
}
