import type { AgentExecutionPorts } from './agentExecutionPorts'
import type { assembleAgentContext } from './agentRequestContext'
import type { AgentRunInput } from './AgentRunExecution'
import { prepareAgentTurnPlan } from './agentTurnPlanning'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { splitAgentHistory } from './context/agentSourcePolicy'
import { continuationRequiresToolCall } from './context/continuationToolCall'
import { carryPriorReads } from './context/priorReads'
import * as requestIntent from './context/requestIntent'
import { requiresContextToolCall } from './context/wholeDigestPolicy'
import { chatMessageBudget } from './core/llm/budgetGate'
import {
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from './core/llm/contextWindow'
import { resolveAgentModelLimits } from './core/llm/modelSelection'
import {
  AGENT_CALLABLE_TOOL_NAMES,
  AGENT_WRITE_TOOL_NAMES,
  isChapterFileSplitRequest,
  selectAgentToolDefinitions,
} from './core/tools/toolDefinitions'
import { t } from './i18n'
import { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import type { VerbexSettings } from './settings/schema/setting.types'
import type { ChatModel } from './types/chat-model.types'
import { RequestTool } from './types/llm/request'
import { tokenCount } from './utils/llm/token'

type Prepared = Awaited<ReturnType<typeof prepareAgentProviderTools>>
export async function prepareAgentRequestPlan(
  ports: AgentExecutionPorts,
  input: AgentRunInput,
  runSettings: VerbexSettings,
  model: ChatModel,
  prepared: Prepared,
) {
  const toolsEnabled = runSettings.chatOptions.enableTools
  const toolMetadata = prepared.toolMetadata
  const modelLimits = resolveAgentModelLimits(
    model.promptLevel,
    input.maxIterations,
    input.request,
  )
  const contextWindow = resolveContextWindow(model)
  const outputBudget = computeOutputBudget(
    contextWindow,
    runSettings.verbex.context.reservedOutputTokens,
  )
  const inputBudget = computeInputBudget(contextWindow, outputBudget)
  const { history, priorHistory } = splitAgentHistory(
    input.history ?? [],
    input.request,
    await carryPriorReads(input, toolMetadata, runSettings, inputBudget),
  )

  const {
    mentionedFiles,
    intentRequest,
    activeWorkflowItem,
    workflowRuntime,
    workflowRun,
    plan,
  } = await prepareAgentTurnPlan(ports, input, history, priorHistory)

  emitAgentAuditEvent(
    input.onAuditEvent,
    input.runId,
    'intent_classification',
    t('ui.AgentRunExecution.agentExecutionPlanPreparedCoverage', {
      p0: plan.kind,
      p1: plan.scopeDecision.coverage,
    }),
  )

  const agentToolDefinitions: RequestTool[] = toolsEnabled
    ? await prepared.withProviderTools(
        selectAgentToolDefinitions(
          input.request,
          model.promptLevel,
          input.activeSkills,
          plan.scopeDecision,
        ),
      )
    : []

  const toolDefinitionTokens = await tokenCount(
    JSON.stringify(agentToolDefinitions),
  )
  const messageInputBudget = chatMessageBudget(
    inputBudget,
    toolDefinitionTokens,
  )

  return {
    modelLimits,
    contextWindow,
    outputBudget,
    inputBudget,
    history,
    priorHistory,
    mentionedFiles,
    intentRequest,
    activeWorkflowItem,
    workflowRuntime,
    workflowRun,
    plan,
    agentToolDefinitions,
    messageInputBudget,
  }
}
type Context = Awaited<ReturnType<typeof assembleAgentContext>>
type Plan = Awaited<ReturnType<typeof prepareAgentRequestPlan>>
export function initialAgentDirective({
  toolsEnabled,
  plan,
  workflowRuntime,
  selfContainedSourceArgs,
  contextPolicy,
  input,
  digests,
  packedContext,
  turns,
}: Pick<Plan, 'workflowRuntime'> & {
  plan: Extract<Plan['plan'], { kind: 'agent_loop' }>
} & Pick<
    Context,
    | 'selfContainedSourceArgs'
    | 'contextPolicy'
    | 'digests'
    | 'packedContext'
    | 'turns'
  > & { toolsEnabled: boolean; input: AgentRunInput }) {
  return toolsEnabled &&
    plan.selfContainedWorkflowTool &&
    AGENT_CALLABLE_TOOL_NAMES.has(plan.selfContainedWorkflowTool) &&
    !plan.buildWikiPreflightSatisfied &&
    workflowRuntime?.stepStatus !== 'completed'
    ? {
        selectedToolName: plan.selfContainedWorkflowTool,
        requireToolCall: true,
        ...(selfContainedSourceArgs
          ? { requiredArguments: selfContainedSourceArgs }
          : {}),
      }
    : toolsEnabled && isChapterFileSplitRequest(plan.intentRequest)
      ? {
          selectedToolName: 'split_file_by_chapters',
          requireToolCall: true,
        }
      : toolsEnabled && plan.resumeAction?.kind === 'required_tool'
        ? {
            selectedToolName: plan.resumeAction.toolName,
            requireToolCall: true,
          }
        : toolsEnabled &&
            !plan.buildWikiPreflightSatisfied &&
            plan.activeStep?.tool &&
            AGENT_WRITE_TOOL_NAMES.has(plan.activeStep.tool) &&
            requestIntent.fileTarget(
              workflowRuntime?.turnIntent ?? '',
              /(?:[^\s]+\.md\b|현재\s*(?:노트|문서|파일)|\bthis\s+(?:note|document|file)\b)/i,
            )
          ? {
              selectedToolName: plan.activeStep.tool,
              requireToolCall: true,
            }
          : requiresContextToolCall(
                contextPolicy,
                input,
                plan,
                digests,
                packedContext,
              )
            ? { requireToolCall: true }
            : continuationRequiresToolCall({
                  isContinuationSignal: input.isContinuationSignal,
                  toolsEnabled,
                  previousTurn: turns.at(-1),
                })
              ? { requireToolCall: true }
              : undefined
}
