import { TFile } from 'obsidian'

import {
  extractUserRequest,
  isSubstantiveUserText,
  lastSubstantiveUserText,
  requestMessageText,
} from '../context/taskPinning'
import {
  type RequestCoverage,
  type RequestOperation,
  decideRequestScope,
} from '../core/routing/scopeDecision'
import {
  CANONICAL_TOOL_MAP,
  SELF_CONTAINED_SOURCE_TOOL_NAMES,
} from '../core/tools/toolDefinitions'
import { ChatWorkflowContextItem } from '../types/chat'
import { RequestMessage } from '../types/llm/request'
import { WorkflowRuntimeState } from '../verbex/types'
import type { ChecklistResumeState, ResumeAction } from '../workflow/types'

export type PlanningInput = {
  request: string
  history: readonly RequestMessage[]
  mentionedFiles: TFile[]
  activeSkills: { cross_document?: boolean; crossDocument?: boolean }[]
  workflowContext?: ChatWorkflowContextItem[]
  currentFile: TFile | null
  isContinuationSignal?: boolean
  scopeOverride?: RequestCoverage
  operationOverride?: RequestOperation
}

export type PlanningExtra = {
  workflowRuntime: WorkflowRuntimeState | null
  hasWikiOrIndexFolder: boolean
  decidedWikiFolder: boolean
  restoredScopePaths: string[]
  checklistResumeState?: ChecklistResumeState
}

export type ExecutionPlan =
  | {
      kind: 'direct_tool_batch'
      workflow: ChatWorkflowContextItem
      step: NonNullable<ChatWorkflowContextItem['steps']>[number]
      intentRequest: string
      scopeDecision: ReturnType<typeof decideRequestScope>
    }
  | {
      kind: 'agent_loop'
      intentRequest: string
      bareContinuation: boolean
      workflowContinuation: boolean
      activeWorkflow: ChatWorkflowContextItem | null
      activeStep: NonNullable<ChatWorkflowContextItem['steps']>[number] | null
      selfContainedWorkflowTool: string | null
      buildWikiPreflightSatisfied: boolean
      isFirstTurn: boolean
      checklistGated: boolean
      scopeDecision: ReturnType<typeof decideRequestScope>
      restoredScopePaths: string[]
      currentFileDrifted: boolean
      effectiveCurrentFile: TFile | null
      resumeAction?: ResumeAction
    }

export class TurnPlanner {
  static plan(input: PlanningInput, extra: PlanningExtra): ExecutionPlan {
    const history = input.history
    const lastHistoryMessage = history[history.length - 1]
    const lastHistoryText =
      lastHistoryMessage?.role === 'user'
        ? requestMessageText(lastHistoryMessage).trim()
        : ''
    const normalizedRequest = input.request.trim()
    const historyIncludesCurrentRequest =
      lastHistoryMessage?.role === 'user' &&
      (extractUserRequest(lastHistoryText) === normalizedRequest ||
        lastHistoryText.endsWith(normalizedRequest))
    const priorHistory = historyIncludesCurrentRequest
      ? history.slice(0, -1)
      : history

    const isFirstTurn = priorHistory.length === 0
    const includedWorkflows = (input.workflowContext ?? []).filter(
      (item) => item.included,
    )
    if (includedWorkflows.length > 1) {
      throw new Error(
        `Verbex Agent can execute at most one workflow per request. Select one workflow or none; received: ${includedWorkflows
          .map((workflow) => workflow.name || workflow.id)
          .join(', ')}`,
      )
    }
    const activeWorkflowItem = includedWorkflows[0] ?? null
    const activeWorkflow = activeWorkflowItem !== null

    const bareContinuation =
      !isFirstTurn &&
      (input.isContinuationSignal === true ||
        !isSubstantiveUserText(input.request))
    const workflowContinuation = activeWorkflow && bareContinuation
    const intentRequest = bareContinuation
      ? lastSubstantiveUserText(priorHistory, input.request)
      : input.request

    const scopeDecision = decideRequestScope({
      request: intentRequest,
      activeSkills: input.activeSkills,
      scopeOverride: input.scopeOverride,
      operationOverride: input.operationOverride,
    })

    const activeWorkflowStep =
      activeWorkflowItem?.steps?.find(
        (step) => step.id === extra.workflowRuntime?.activeStepId,
      ) ?? null

    const checklistGated = Boolean(
      activeWorkflowStep?.verification?.requireChecklistComplete,
    )

    // 1. Direct tool batch check (e.g. findings sink)
    if (
      activeWorkflowStep?.batch?.state_authority === 'checklist' &&
      activeWorkflowStep.batch.sink === 'findings' &&
      extra.workflowRuntime
    ) {
      return {
        kind: 'direct_tool_batch',
        workflow: activeWorkflowItem,
        step: activeWorkflowStep,
        intentRequest,
        scopeDecision,
      }
    }

    // 2. Self-contained workflow tool preflight
    const rawWorkflowTool =
      activeWorkflowStep?.tool &&
      (SELF_CONTAINED_SOURCE_TOOL_NAMES.has(activeWorkflowStep.tool) ||
        SELF_CONTAINED_SOURCE_TOOL_NAMES.has(
          CANONICAL_TOOL_MAP[activeWorkflowStep.tool] ?? '',
        ))
        ? activeWorkflowStep.tool
        : null
    const selfContainedWorkflowTool = rawWorkflowTool
      ? (CANONICAL_TOOL_MAP[rawWorkflowTool] ?? rawWorkflowTool)
      : null

    const buildWikiPreflightSatisfied =
      selfContainedWorkflowTool === 'build_review_index' &&
      (extra.hasWikiOrIndexFolder || extra.decidedWikiFolder)

    // 3. Drift guard logic
    const isWorkflowRestoreTurn =
      workflowContinuation && input.mentionedFiles.length === 0

    const currentFileDrifted =
      isWorkflowRestoreTurn &&
      input.currentFile != null &&
      extra.restoredScopePaths.length > 0 &&
      !extra.restoredScopePaths.includes(input.currentFile.path)

    const effectiveCurrentFile = currentFileDrifted ? null : input.currentFile

    const resumeAction =
      checklistGated &&
      extra.checklistResumeState?.kind === 'pending' &&
      bareContinuation
        ? {
            kind: 'required_tool' as const,
            toolName: 'checklist_next' as const,
          }
        : undefined

    return {
      kind: 'agent_loop',
      intentRequest,
      bareContinuation,
      workflowContinuation,
      activeWorkflow: activeWorkflowItem,
      activeStep: activeWorkflowStep,
      selfContainedWorkflowTool,
      buildWikiPreflightSatisfied,
      isFirstTurn,
      checklistGated,
      scopeDecision,
      restoredScopePaths: extra.restoredScopePaths,
      currentFileDrifted,
      effectiveCurrentFile,
      resumeAction,
    }
  }
}
