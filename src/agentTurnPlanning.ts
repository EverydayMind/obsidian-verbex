import type { TFile } from 'obsidian'

import type { AgentExecutionPorts } from './agentExecutionPorts'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { explicitlyRetargetsCurrentFile } from './context/agentSourcePolicy'
import { isBareContinuation } from './context/bareContinuation'
import { mergeUniqueByPath } from './context/fileCollections'
import { lastSubstantiveUserText } from './context/taskPinning'
import { t } from './i18n'
import { PlanningInput, TurnPlanner } from './prompt/TurnPlanner'
import type { HwpEditScope } from './provider/contract'
import { RunArtifactStore } from './runstate/RunArtifactStore'
import type { AuditEvent, ChatWorkflowContextItem } from './types/chat'
import type { RequestMessage } from './types/llm/request'
import type { Mentionable } from './types/mentionable'
import type { ChecklistResumeState } from './workflow/types'

export type AgentTurnPlanningInput = {
  runId: string
  request: string
  isContinuationSignal?: boolean
  currentFile?: TFile | null
  mentionables?: Mentionable[]
  companionScope?: HwpEditScope
  workflowContext?: ChatWorkflowContextItem[]
  activeSkills?: PlanningInput['activeSkills']
  onAuditEvent?: (event: AuditEvent) => void
}

type TurnPlanningPorts = Pick<
  AgentExecutionPorts,
  'context' | 'workflow' | 'runs' | 'reviewIndexCoordinator'
>

/**
 * Turn preparation before context assembly: resolves the continuation intent,
 * loads workflow runtime and review scope, and asks TurnPlanner for the plan.
 * Persists only the review scope; it never calls a model or a tool.
 */
export async function prepareAgentTurnPlan(
  ports: TurnPlanningPorts,
  input: AgentTurnPlanningInput,
  history: RequestMessage[],
  priorHistory: RequestMessage[],
) {
  const isFirstTurn = priorHistory.length === 0
  // A document the user named in the text (quoted title, path or file name)
  // counts as attached, so the model reads it instead of asking where it is.
  const mentionedFiles = mergeUniqueByPath(
    ports.context.resolveMentionedFiles(input.mentionables ?? []),
    ports.context
      .resolveReferencedFiles(input.request)
      .filter((file) => file.path !== input.currentFile?.path),
  )

  const bareContinuation = isBareContinuation({ ...input, isFirstTurn })
  const intentRequest = bareContinuation
    ? lastSubstantiveUserText(priorHistory, input.request)
    : input.request

  const includedWorkflows = (input.workflowContext ?? []).filter(
    (item) => item.included,
  )
  const activeWorkflowItem = includedWorkflows[0] ?? null

  // ── 사전 데이터 로딩 (비동기 의존성) ──
  const workflowRuntime = activeWorkflowItem
    ? await ports.workflow.prepareWorkflowRuntime(
        input.runId,
        activeWorkflowItem,
        intentRequest,
        input.request,
        input.isContinuationSignal === true,
      )
    : null
  const workflowRun = workflowRuntime
    ? await ports.runs.loadRunForUpdate(
        input.runId,
        activeWorkflowItem?.name ?? '',
      )
    : null

  if (activeWorkflowItem) {
    emitAgentAuditEvent(
      input.onAuditEvent,
      input.runId,
      'intent_classification',
      t('runtimeR5.workflowMatched', { name: activeWorkflowItem.name }),
      activeWorkflowItem.id,
    )
  }

  const hasWikiOrIndexFolder = Boolean(
    workflowRun && RunArtifactStore.getIndexFolder(workflowRun),
  )
  const decidedWikiFolder = Boolean(
    ports.reviewIndexCoordinator.decidedWikiFolderWithChecklist(input.runId),
  )

  let restoredScopePaths: string[] = []
  if (activeWorkflowItem && input.runId) {
    const retargetsCurrentFile =
      !isFirstTurn &&
      !bareContinuation &&
      input.currentFile != null &&
      explicitlyRetargetsCurrentFile(input.request)
    if (mentionedFiles.length > 0 || isFirstTurn || retargetsCurrentFile) {
      await ports.workflow.persistWorkflowReviewScope(input.runId, [
        ...(input.currentFile ? [input.currentFile.path] : []),
        ...mentionedFiles.map((file) => file.path),
      ])
    } else {
      restoredScopePaths = await ports.workflow.loadWorkflowReviewScope(
        input.runId,
      )
    }
  }

  // ── 실행 계획(Execution Plan) 도출 ──
  const planningInput = {
    request: input.request,
    history,
    mentionedFiles,
    activeSkills: input.activeSkills ?? [],
    workflowContext: input.workflowContext,
    currentFile: input.currentFile ?? null,
    isContinuationSignal: input.isContinuationSignal,
    scopeOverride: input.companionScope ? ('targeted' as const) : undefined,
    operationOverride: input.companionScope?.operation,
  }
  let checklistResumeState: ChecklistResumeState | undefined = undefined
  if (bareContinuation && activeWorkflowItem && workflowRun) {
    const activeWorkflowStep =
      activeWorkflowItem.steps?.find(
        (step) => step.id === workflowRuntime?.activeStepId,
      ) ?? null
    if (activeWorkflowStep) {
      checklistResumeState = await ports.workflow.getChecklistResumeState(
        activeWorkflowStep,
        workflowRun,
      )
    }
  }

  const planningExtra = {
    workflowRuntime,
    hasWikiOrIndexFolder,
    decidedWikiFolder,
    restoredScopePaths,
    checklistResumeState,
  }
  const plan = {
    ...TurnPlanner.plan(planningInput, planningExtra),
    referencedPaths: ports.context.referencedPaths(input.request, priorHistory),
  }

  return {
    mentionedFiles,
    intentRequest,
    activeWorkflowItem,
    workflowRuntime,
    workflowRun,
    plan,
  }
}
