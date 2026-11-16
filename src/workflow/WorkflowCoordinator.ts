import { App, TFile, normalizePath } from 'obsidian'

import type { ContextPacketSeed } from '../core/batch/contextPacker'
import { AgentLoopResult } from '../core/llm/agentLoop'
import { ReviewIndexCoordinator } from '../core/review-index/ReviewIndexCoordinator'
import {
  type CoverageLedger,
  type CoverageUnit,
  type CoverageUnitRecord,
  type RequirementCoverage,
  coverageUnitFromWorkflowEntry,
  coverageUnitPacketSeeds,
  createRequirementCoverage,
  isCoverageResolvedRecord,
  makeCoverageUnitId,
  mergeCoverageLedgers,
  withDerivedCoverageState,
} from '../core/routing/coverage'
import { sectionsByPattern, splitLines } from '../core/tools/noteSlicing'
import { PlanTracker } from '../plan/PlanTracker'
import { RunArtifactStore } from '../runstate/RunArtifactStore'
import { RunLifecycle } from '../runstate/RunLifecycle'
import { TurnRecord, finishTurnRecord } from '../runstate/turnLedger'
import { ChatWorkflowContextItem } from '../types/chat'
import { sha256Hex } from '../utils/hash'
import { computeSeverityCounts } from '../utils/reviewMetrics'
import { VerbexPlanStep, VerbexRunState } from '../verbex/types'
import { nowIso } from '../verbex/vault'

import type { ChecklistResumeState } from './types'
import * as modelText from './workflowText'

export type WorkflowStepRuntimeStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type WorkflowRuntimeState = {
  workflowGoal: string
  turnIntent: string
  activeWorkflowId: string
  activeStepId: string
  stepStatus: WorkflowStepRuntimeStatus
  stepStatuses: Record<string, WorkflowStepRuntimeStatus>
  approvedAt?: string
}

export type WorkflowCoveragePreparation = {
  ledger: WorkflowCoverageEntry[]
  context: string
  current?: WorkflowCoverageEntry
  sourceText?: string
  coverage?: RequirementCoverage
  coveragePacketSeeds?: ContextPacketSeed[]
}

export type WorkflowCoverageEntry = {
  path: string
  articleId: string
  startLine: number
  endLine: number
  status: 'pending' | 'reviewed'
  unitId?: string
  revisionHash?: string
}

export const WORKFLOW_STEP_OUTPUT_PREFIX = 'workflow_step_output:'
const WORKFLOW_COVERAGE_ARTIFACT = 'workflow_coverage_ledger'
const WORKFLOW_REVIEW_CURSOR_ARTIFACT = 'workflow_review_cursor'
const AGENT_COVERAGE_ARTIFACT = 'agent_coverage_ledger'
const MAX_WORKFLOW_REVIEW_SCOPE = 40
const STRUCTURED_DOCUMENT_BOUNDARY_PATTERN =
  '^(?:\\s*#{1,6}\\s*)?(?:ARTICLE|CHAPTER|ANNEX|APPENDIX|SCHEDULE)\\b[^\\r\\n]*$|^\\s*제\\s*\\d+\\s*[조장](?:\\s*[:：-][^\\r\\n]*)?$'

function englishAbsence(
  value: string,
  kind: 'quote' | 'problem' | 'correction',
) {
  if (/^(?:none|not\s+applicable|n\/a)[.!]?$/i.test(value)) return true
  return kind === 'problem'
    ? /^no\s+(?:issues?|problems?)[.!]?$/i.test(value)
    : kind === 'correction' && /^no\s+corrections?[.!]?$/i.test(value)
}

export function buildWorkflowCoverageLedger(input: {
  entries: readonly WorkflowCoverageEntry[]
  units: readonly CoverageUnit[]
  previous?: CoverageLedger | null
}): CoverageLedger {
  const previousRecords = new Map(
    (input.previous?.records ?? []).map((record) => [
      record.unit.unitId,
      record,
    ]),
  )
  const entryByUnitId = new Map(
    input.entries
      .filter((entry): entry is WorkflowCoverageEntry & { unitId: string } =>
        Boolean(entry.unitId),
      )
      .map((entry) => [entry.unitId, entry]),
  )
  const records: CoverageUnitRecord[] = input.units.map((unit) => {
    const previous = previousRecords.get(unit.unitId)
    const entry = entryByUnitId.get(unit.unitId)
    const processingStatus = entry?.status === 'reviewed' ? 'done' : 'pending'
    return {
      unit,
      processingStatus,
      ...(previous?.evidenceRefs
        ? { evidenceRefs: [...previous.evidenceRefs] }
        : {}),
    }
  })
  const coverage = createRequirementCoverage({
    requirementId: input.previous?.coverage.requirementId ?? 'detailed_review',
    requiredScope: 'whole',
    requiredUnits: input.units,
    candidateUnits: input.units,
    plannedUnits: input.units,
    evidenceRefs: input.previous?.coverage.evidenceRefs ?? [],
    completeness: 'enumerated',
  })
  const currentUnitIds = new Set(
    records
      .filter((record) => record.processingStatus === 'done')
      .map((record) => record.unit.unitId),
  )
  const evidenceRecords = (input.previous?.evidenceRecords ?? []).filter(
    (record) => currentUnitIds.has(record.unitId),
  )
  return {
    schemaVersion: 1,
    coverage: withDerivedCoverageState(coverage, records),
    records,
    ...(evidenceRecords.length > 0 ? { evidenceRecords } : {}),
  }
}

function workflowEntryStatusFromCoverage(
  unitId: string,
  records: ReadonlyMap<string, CoverageUnitRecord>,
): WorkflowCoverageEntry['status'] {
  const record = records.get(unitId)
  return record && isCoverageResolvedRecord(record) ? 'reviewed' : 'pending'
}

/**
 * Project the generalized ledger back to the legacy checklist-shaped view.
 * Matching uses revision-bound unit identity first and falls back to location
 * for pre-v2 entries, so old run artifacts can be upgraded without carrying
 * a reviewed state across a source revision change.
 */
export function projectWorkflowEntriesFromCoverage(input: {
  entries: readonly WorkflowCoverageEntry[]
  coverage: CoverageLedger
}): WorkflowCoverageEntry[] {
  const units = input.coverage.coverage.plannedUnits
  const unitsById = new Map(units.map((unit) => [unit.unitId, unit]))
  const records = new Map(
    input.coverage.records.map((record) => [record.unit.unitId, record]),
  )
  return input.entries.map((entry) => {
    const matchedUnit = entry.unitId
      ? unitsById.get(entry.unitId)
      : units.find(
          (unit) =>
            unit.path === entry.path &&
            unit.startLine === entry.startLine &&
            unit.endLine === entry.endLine,
        )
    if (!matchedUnit) return { ...entry, status: 'pending' as const }
    return {
      ...entry,
      unitId: matchedUnit.unitId,
      revisionHash: matchedUnit.revisionHash,
      status: workflowEntryStatusFromCoverage(matchedUnit.unitId, records),
    }
  })
}

/** Restore the legacy view when only the v2 artifact survived persistence. */
export function workflowEntriesFromCoverageLedger(
  coverage: CoverageLedger,
): WorkflowCoverageEntry[] {
  const records = new Map(
    coverage.records.map((record) => [record.unit.unitId, record]),
  )
  return coverage.coverage.plannedUnits.map((unit) => ({
    path: unit.path,
    articleId:
      unit.headingPath?.join(' / ') ??
      `${unit.path}:${unit.startLine}-${unit.endLine}`,
    startLine: unit.startLine,
    endLine: unit.endLine,
    status: workflowEntryStatusFromCoverage(unit.unitId, records),
    unitId: unit.unitId,
    revisionHash: unit.revisionHash,
  }))
}

type WorkflowStep = NonNullable<ChatWorkflowContextItem['steps']>[number]

export type WorkflowTransitionEvent = {
  type: 'continue' | 'restart'
  steps: WorkflowStep[]
  checklistComplete: boolean
  coveragePending: boolean
}

export function transitionWorkflowState(
  state: WorkflowRuntimeState,
  event: WorkflowTransitionEvent,
): WorkflowRuntimeState {
  if (state.stepStatus !== 'completed') return state
  if (event.type === 'restart') {
    return {
      ...state,
      stepStatus: 'in_progress',
      stepStatuses: {
        ...state.stepStatuses,
        [state.activeStepId]: 'in_progress',
      },
    }
  }
  const remainCurrent = !event.checklistComplete || event.coveragePending
  const next = remainCurrent
    ? event.steps.find((step) => step.id === state.activeStepId)
    : event.steps.find(
        (step) =>
          state.stepStatuses[step.id] === 'pending' &&
          step.dependsOn.every(
            (dependency) => state.stepStatuses[dependency] === 'completed',
          ),
      )
  if (!next) return state
  return {
    ...state,
    activeStepId: next.id,
    stepStatus: 'in_progress',
    approvedAt: nowIso(),
    stepStatuses: { ...state.stepStatuses, [next.id]: 'in_progress' },
  }
}

export class WorkflowCoordinator {
  constructor(
    private app: App,
    private runs: RunLifecycle,
    private reviewIndex: ReviewIndexCoordinator,
  ) {}

  async persistReviewScope(runId: string, paths: string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean))].slice(
      0,
      MAX_WORKFLOW_REVIEW_SCOPE,
    )
    if (unique.length === 0) return
    await this.runs.updateRunArtifacts(runId, (run) =>
      RunArtifactStore.setWorkflowReviewScope(run, unique),
    )
  }

  async loadReviewScope(runId: string): Promise<string[]> {
    try {
      const run = await this.runs.loadRunForUpdate(
        runId,
        'Workflow review scope',
      )
      return RunArtifactStore.getWorkflowReviewScope(run)
    } catch {
      return []
    }
  }

  async prepareRuntime(
    runId: string,
    workflow: ChatWorkflowContextItem,
    workflowGoal: string,
    turnIntent: string,
    isContinuationSignal: boolean,
  ): Promise<WorkflowRuntimeState | null> {
    const steps = workflow.steps ?? []
    if (steps.length === 0) return null
    const base = await this.runs.loadRunForUpdate(runId, workflow.name)
    const saved = RunArtifactStore.getWorkflowRuntimeState(base)
    let state: WorkflowRuntimeState
    if (!saved || saved.activeWorkflowId !== workflow.id) {
      const first =
        steps.find((step) => step.dependsOn.length === 0) ?? steps[0]
      state = {
        workflowGoal,
        turnIntent,
        activeWorkflowId: workflow.id,
        activeStepId: first.id,
        stepStatus: 'in_progress',
        stepStatuses: Object.fromEntries(
          steps.map((step) => [
            step.id,
            step.id === first.id ? 'in_progress' : 'pending',
          ]),
        ),
      }
    } else {
      state = { ...saved, turnIntent }
      const ledger = RunArtifactStore.getWorkflowCoverageLedger(base) ?? []
      const currentStep = steps.find((step) => step.id === state.activeStepId)
      const gate =
        isContinuationSignal && state.stepStatus === 'completed' && currentStep
          ? await this.verifyStepCompletion(currentStep, base)
          : { complete: true as const }
      state = transitionWorkflowState(state, {
        type: isContinuationSignal ? 'continue' : 'restart',
        steps,
        checklistComplete: gate.complete,
        coveragePending:
          state.activeStepId === 'detailed_review' &&
          ledger.some((entry) => entry.status === 'pending'),
      })
    }
    const updated = RunArtifactStore.setWorkflowRuntimeState(base, state)
    await this.runs.saveRunRebased(base, {
      ...updated,
      status: 'in_progress',
      workflow: workflow.id,
    })
    return state
  }

  activeGuidance(
    workflow: ChatWorkflowContextItem,
    state: WorkflowRuntimeState,
    artifacts: Record<string, string>,
  ): string {
    const step = workflow.steps?.find(
      (candidate) => candidate.id === state.activeStepId,
    )
    if (!step) return workflow.overview
    const predecessors = step.dependsOn
      .map((dependency) => {
        const output =
          artifacts[
            `${WORKFLOW_STEP_OUTPUT_PREFIX}${workflow.id}:${dependency}`
          ]
        return output ? modelText.predecessorOutput(dependency, output) : null
      })
      .filter((value): value is string => Boolean(value))
    return [
      modelText.activeWorkflowHeading(),
      `Workflow: ${workflow.name} (${workflow.id})`,
      modelText.workflowGoal(state.workflowGoal),
      modelText.turnRequest(state.turnIntent),
      modelText.currentStep(step.title, step.id),
      step.description ? modelText.stepDescription(step.description) : null,
      step.prompt ? modelText.stepPrompt(step.prompt) : null,
      step.verification
        ? modelText.verificationContract(JSON.stringify(step.verification))
        : null,
      modelText.currentStepInstruction(),
      ...predecessors,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n\n')
  }

  async prepareCoverage(
    runId: string,
    files: TFile[],
  ): Promise<WorkflowCoveragePreparation | null> {
    if (files.length === 0) return null
    const base = await this.runs.loadRunForUpdate(runId, 'Workflow coverage')
    const persistedCoverage = RunArtifactStore.getWorkflowCoverageLedgerV2(base)
    let ledger: WorkflowCoverageEntry[] =
      RunArtifactStore.getWorkflowCoverageLedger(base) ?? []
    if (persistedCoverage) {
      ledger = ledger.length
        ? projectWorkflowEntriesFromCoverage({
            entries: ledger,
            coverage: persistedCoverage,
          })
        : workflowEntriesFromCoverageLedger(persistedCoverage)
    }
    const sourceCache = new Map<
      string,
      { file: TFile; lines: string[]; revisionHash: string }
    >()
    const loadSource = async (path: string) => {
      const cached = sourceCache.get(path)
      if (cached) return cached
      const file = this.app.vault.getFileByPath(path)
      if (!file || !('extension' in file)) return null
      const content = await this.app.vault.cachedRead(file)
      const source = {
        file,
        lines: splitLines(content),
        revisionHash: await sha256Hex(content),
      }
      sourceCache.set(path, source)
      return source
    }
    if (ledger.length === 0) {
      for (const file of files) {
        const source = await loadSource(file.path)
        if (!source) continue
        const { lines, revisionHash } = source
        const sections = sectionsByPattern(
          lines,
          STRUCTURED_DOCUMENT_BOUNDARY_PATTERN,
        ).sections
        const effective = sections.length
          ? sections
          : [
              {
                title: file.basename,
                startLine: 1,
                endLine: lines.length,
              },
            ]
        ledger.push(
          ...effective.map((section) => ({
            path: file.path,
            articleId: section.title,
            startLine: section.startLine,
            endLine: section.endLine,
            status: 'pending' as const,
            revisionHash,
            unitId: makeCoverageUnitId(
              file.path,
              revisionHash,
              section.startLine,
              section.endLine,
            ),
          })),
        )
      }
    } else {
      // Legacy workflow ledgers predate revision-bound unit identities. A
      // changed source never inherits the previous reviewed state.
      ledger = await Promise.all(
        ledger.map(async (entry) => {
          const source = await loadSource(entry.path)
          if (!source) return entry
          const unitId = makeCoverageUnitId(
            entry.path,
            source.revisionHash,
            entry.startLine,
            entry.endLine,
          )
          const unchanged =
            entry.revisionHash === source.revisionHash &&
            entry.unitId === unitId
          return {
            ...entry,
            revisionHash: source.revisionHash,
            unitId,
            status: unchanged ? entry.status : ('pending' as const),
          }
        }),
      )
    }
    const next = ledger.find((entry) => entry.status === 'pending')
    if (!next) {
      await this.runs.updateRunArtifacts(runId, (run) =>
        RunArtifactStore.setWorkflowCoverageLedger(run, ledger),
      )
      return {
        ledger,
        context: modelText.coverageComplete(),
      }
    }
    const coverageUnits: CoverageUnit[] = []
    const pendingUnits: CoverageUnit[] = []
    const contentByUnitId: Record<string, string> = {}
    for (const entry of ledger) {
      if (!entry.unitId || !entry.revisionHash) continue
      const source = sourceCache.get(entry.path)
      if (!source) continue
      const unit = coverageUnitFromWorkflowEntry(entry)
      coverageUnits.push(unit)
      contentByUnitId[unit.unitId] = source.lines
        .slice(entry.startLine - 1, entry.endLine)
        .map((line, index) => `${entry.startLine + index}: ${line}`)
        .join('\n')
      if (entry.status === 'pending') pendingUnits.push(unit)
    }
    const file = this.app.vault.getFileByPath(next.path)
    if (!file || !('extension' in file)) return null
    const nextSource = sourceCache.get(next.path)
    if (!nextSource) return null
    const sourceText = nextSource.lines
      .slice(next.startLine - 1, next.endLine)
      .join('\n')
    const coverage =
      coverageUnits.length === ledger.length
        ? createRequirementCoverage({
            requirementId: 'detailed_review',
            requiredScope: 'whole',
            requiredUnits: coverageUnits,
            candidateUnits: coverageUnits,
            plannedUnits: coverageUnits,
            completeness: 'enumerated',
          })
        : undefined
    const coverageLedger = coverage
      ? buildWorkflowCoverageLedger({
          entries: ledger,
          units: coverage.requiredUnits,
          previous: RunArtifactStore.getWorkflowCoverageLedgerV2(base),
        })
      : undefined
    const effectiveCoverage = coverageLedger?.coverage ?? coverage
    const packetCoverage = effectiveCoverage
      ? { ...effectiveCoverage, plannedUnits: pendingUnits }
      : undefined
    const coveragePacketSeeds = packetCoverage
      ? coverageUnitPacketSeeds({
          coverage: packetCoverage,
          contentByUnitId,
          kind: 'chunk',
          priority: 'mandatory',
          mustKeep: true,
        })
      : undefined
    const sourceTextForPendingUnits = pendingUnits
      .map((unit) => contentByUnitId[unit.unitId])
      .filter(Boolean)
      .join('\n\n')
    const cursor = {
      path: next.path,
      articleId: next.articleId,
      startLine: next.startLine,
      endLine: next.endLine,
      unitId: next.unitId,
    }
    await this.runs.updateRunArtifacts(runId, (run) => {
      let updated = RunArtifactStore.setWorkflowCoverageLedger(run, ledger)
      if (coverageLedger) {
        updated = RunArtifactStore.setWorkflowCoverageLedgerV2(
          updated,
          coverageLedger,
        )
      }
      return RunArtifactStore.setWorkflowReviewCursor(updated, cursor)
    })
    const reviewed = ledger.filter(
      (entry) => entry.status === 'reviewed',
    ).length
    return {
      ledger,
      current: next,
      sourceText: sourceTextForPendingUnits || sourceText,
      ...(effectiveCoverage ? { coverage: effectiveCoverage } : {}),
      ...(coveragePacketSeeds ? { coveragePacketSeeds } : {}),
      context: [
        modelText.coverageProgress(reviewed, ledger.length),
        modelText.controllerCursor(
          next.path,
          next.startLine,
          next.endLine,
          next.articleId,
        ),
        modelText.coverageInstruction(),
      ].join('\n\n'),
    }
  }

  validateCoverageOutput(text: string, sourceText: string): string | null {
    const rows = text
      .split('\n')
      .filter((line) => line.trim().startsWith('|'))
      .map((line) =>
        line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim()),
      )
      .filter(
        (cells) =>
          cells.length >= 7 && !/^[-:]+$/.test(cells[0]) && cells[0] !== '#',
      )
    for (const cells of rows) {
      const quote = cells[4]?.replace(/^`+|`+$/g, '').trim() ?? ''
      const problem = cells[5]?.trim() ?? ''
      const correction = cells[6]?.trim() ?? ''
      if (/\.\.\.|…/.test(quote)) return modelText.quoteEllipsis()
      if (
        quote &&
        quote !== '없음' &&
        !englishAbsence(quote, 'quote') &&
        !sourceText.includes(quote)
      ) {
        return modelText.quoteMismatch(quote.slice(0, 120))
      }
      if (
        /^(?:없음|문제\s*없음|해당\s*없음)[.!]?$/i.test(problem) ||
        englishAbsence(problem, 'problem')
      ) {
        return modelText.noProblemRow()
      }
      if (
        /^(?:없음|수정안\s*없음|해당\s*없음)[.!]?$/i.test(correction) ||
        englishAbsence(correction, 'correction')
      ) {
        return modelText.noCorrectionRow()
      }
    }
    return null
  }

  async persistAgentResult(
    input: {
      runId: string
      turnRecord?: TurnRecord
    },
    result: AgentLoopResult,
    workflow: ChatWorkflowContextItem | null = null,
    workflowRuntime: WorkflowRuntimeState | null = null,
  ): Promise<void> {
    const runId = input.runId
    const base = await this.runs.loadRunForUpdate(runId, `Agent run: ${runId}`)
    const paused = result.stoppedReason === 'paused'
    const modelCompleted = result.stoppedReason === 'completed'
    const activeStep = workflow?.steps?.find(
      (step) => step.id === workflowRuntime?.activeStepId,
    )
    const completionGate =
      modelCompleted && activeStep
        ? await this.verifyStepCompletion(activeStep, base)
        : modelCompleted
          ? { complete: true as const }
          : { complete: false as const, remaining: [] as string[] }
    const completed = modelCompleted && completionGate.complete
    const completionWarnings = completionGate.complete
      ? (completionGate.warnings ?? [])
      : []
    if (completed && completionWarnings.length > 0) {
      result.finalText = [
        result.finalText,
        '',
        ...completionWarnings.map((warning) =>
          modelText.completionWarning(warning),
        ),
      ].join('\n')
    }
    if (modelCompleted && !completionGate.complete) {
      result.finalText = [
        result.finalText,
        '',
        modelText.stepIncomplete(
          completionGate.remaining.slice(0, 5).join(', '),
        ),
        modelText.continueStep(),
      ].join('\n')
    }
    const plan: VerbexPlanStep[] = base.plan.map((step) =>
      step.status === 'pending'
        ? {
            ...step,
            status: paused
              ? ('pending' as const)
              : completed
                ? ('completed' as const)
                : modelCompleted
                  ? ('pending' as const)
                  : ('failed' as const),
          }
        : step,
    )
    const synced = PlanTracker.syncRunWithPlan(base, plan)
    let coverageArtifacts: Record<string, string> = {}
    let nextWorkflowCoverageLedger: CoverageLedger | null = null
    if (completed && workflowRuntime?.activeStepId === 'detailed_review') {
      const ledger = RunArtifactStore.getWorkflowCoverageLedger(base) ?? []
      try {
        const cursor =
          (RunArtifactStore.getWorkflowReviewCursor(
            base,
          ) as Partial<WorkflowCoverageEntry>) ?? {}
        const previousCoverageLedger =
          RunArtifactStore.getWorkflowCoverageLedgerV2(base)
        const nextWorkflowCoverage =
          previousCoverageLedger && result.coverage
            ? mergeCoverageLedgers(previousCoverageLedger, result.coverage)
            : null
        const nextLedger = nextWorkflowCoverage
          ? projectWorkflowEntriesFromCoverage({
              entries: ledger,
              coverage: nextWorkflowCoverage,
            })
          : ledger.map((entry) =>
              (
                cursor.unitId
                  ? entry.unitId === cursor.unitId
                  : entry.path === cursor.path &&
                    entry.startLine === cursor.startLine &&
                    entry.endLine === cursor.endLine
              )
                ? { ...entry, status: 'reviewed' as const }
                : entry,
            )
        const nextCursor = {
          completed: `${cursor.path ?? ''} L${cursor.startLine ?? ''}-L${cursor.endLine ?? ''}`,
          remaining: nextLedger.filter((entry) => entry.status === 'pending')
            .length,
        }
        nextWorkflowCoverageLedger =
          nextWorkflowCoverage ??
          (previousCoverageLedger
            ? buildWorkflowCoverageLedger({
                entries: nextLedger,
                units: previousCoverageLedger.coverage.plannedUnits,
                previous: previousCoverageLedger,
              })
            : null)
        coverageArtifacts = {
          [WORKFLOW_COVERAGE_ARTIFACT]: JSON.stringify(nextLedger),
          [WORKFLOW_REVIEW_CURSOR_ARTIFACT]: JSON.stringify(nextCursor),
        }
      } catch {
        coverageArtifacts = {}
      }
    }
    const nextWorkflowRuntime = workflowRuntime
      ? {
          ...workflowRuntime,
          stepStatus: paused
            ? ('in_progress' as const)
            : completed
              ? ('completed' as const)
              : modelCompleted
                ? ('in_progress' as const)
                : ('failed' as const),
          stepStatuses: {
            ...workflowRuntime.stepStatuses,
            [workflowRuntime.activeStepId]: paused
              ? ('in_progress' as const)
              : completed
                ? ('completed' as const)
                : modelCompleted
                  ? ('in_progress' as const)
                  : ('failed' as const),
          },
        }
      : null
    let updated: VerbexRunState = {
      ...synced,
      status: paused
        ? 'paused'
        : completed
          ? 'completed'
          : modelCompleted
            ? 'in_progress'
            : 'error',
      currentStepId: completed ? null : synced.currentStepId,
      artifacts: {
        ...synced.artifacts,
        agent_final: result.finalText,
        agent_iterations: String(result.iterations),
        agent_tool_calls: String(result.toolCalls.length),
        agent_evidence_discovered: result.evidence.discoveredPaths.join('\n'),
        agent_evidence_inspected: result.evidence.inspectedPaths.join('\n'),
        workflow_severity_counts: JSON.stringify(
          computeSeverityCounts(result.finalText),
        ),
        ...(result.executor ? { agent_executor: result.executor } : {}),
      },
      logs: [
        ...synced.logs,
        {
          timestamp: nowIso(),
          level: paused || completed || modelCompleted ? 'info' : 'error',
          message: `Agent ${result.stoppedReason}; ${result.toolCalls.length} tool call(s), ${result.iterations} turn(s).`,
        },
      ],
    }

    if (completionWarnings.length > 0) {
      updated = RunArtifactStore.setArtifact(
        updated,
        'workflow_completion_warnings',
        JSON.stringify(completionWarnings),
      )
    }
    if (coverageArtifacts[WORKFLOW_COVERAGE_ARTIFACT]) {
      const parsedLedger = JSON.parse(
        coverageArtifacts[WORKFLOW_COVERAGE_ARTIFACT],
      ) as unknown
      const nextLedger = Array.isArray(parsedLedger)
        ? (parsedLedger as WorkflowCoverageEntry[])
        : []
      const nextCursor: unknown = JSON.parse(
        coverageArtifacts[WORKFLOW_REVIEW_CURSOR_ARTIFACT],
      )
      updated = RunArtifactStore.setWorkflowCoverageLedger(updated, nextLedger)
      updated = RunArtifactStore.setWorkflowReviewCursor(updated, nextCursor)
    }
    if (nextWorkflowCoverageLedger) {
      updated = RunArtifactStore.setWorkflowCoverageLedgerV2(
        updated,
        nextWorkflowCoverageLedger,
      )
    }
    if (workflow && nextWorkflowRuntime) {
      updated = RunArtifactStore.setWorkflowRuntimeState(
        updated,
        nextWorkflowRuntime,
      )
      updated = RunArtifactStore.setArtifact(
        updated,
        `${WORKFLOW_STEP_OUTPUT_PREFIX}${workflow.id}:${nextWorkflowRuntime.activeStepId}`,
        result.finalText,
      )
    }

    // Batch executors attribute factual outcomes to every processed
    // CoverageUnit. Preserve that ledger on the run so the result remains
    // available after the chat response and can be resumed or inspected
    // without re-reading the batch markdown.
    if (result.coverage) {
      updated = RunArtifactStore.setArtifact(
        updated,
        AGENT_COVERAGE_ARTIFACT,
        JSON.stringify(result.coverage),
      )
    }

    // Completion and abort serialize their execution-ID checks on the repository lock.
    await this.runs.saveAgentTurn(
      base,
      updated,
      finishTurnRecord(
        input.turnRecord,
        result,
        `${runId}:${RunArtifactStore.getTurnLedger(base).droppedTurns + RunArtifactStore.getTurnLedger(base).records.length + 1}`,
      ),
    )
  }

  async verifyStepCompletion(
    step: WorkflowStep,
    run: VerbexRunState,
  ): Promise<
    | { complete: true; warnings?: string[] }
    | { complete: false; remaining: string[] }
  > {
    if (
      (step.tool === 'build_review_index' ||
        step.outputArtifact === 'index_folder') &&
      step.outputArtifact &&
      !RunArtifactStore.getArtifact(run, step.outputArtifact)
    ) {
      const recovered = await this.reviewIndex.recoverWikiFolderArtifact(run)
      if (recovered) {
        run = RunArtifactStore.setArtifact(run, step.outputArtifact, recovered)
      }
    }
    if (
      step.outputArtifact &&
      !RunArtifactStore.getArtifact(run, step.outputArtifact)
    ) {
      return {
        complete: false,
        remaining: [modelText.missingArtifact(step.outputArtifact)],
      }
    }
    const phase = step.verification?.requireChecklistComplete
    if (!phase) return { complete: true }
    const folder = RunArtifactStore.getIndexFolder(run)
    if (!folder) {
      return {
        complete: false,
        remaining: [modelText.missingIndexArtifact()],
      }
    }
    try {
      return await this.reviewIndex.verifyChecklistPhase(folder, phase)
    } catch (error) {
      return {
        complete: false,
        remaining: [
          modelText.checklistFailure(
            error instanceof Error ? error.message : String(error),
          ),
        ],
      }
    }
  }

  async getChecklistResumeState(
    step: WorkflowStep,
    run: VerbexRunState,
  ): Promise<ChecklistResumeState> {
    const phase = step.verification?.requireChecklistComplete
    if (!phase) {
      return { kind: 'unavailable', reason: 'Not a checklist-gated step' }
    }
    const folder = RunArtifactStore.getIndexFolder(run)
    if (!folder) {
      return { kind: 'unavailable', reason: 'index_folder artifact is missing' }
    }
    try {
      const checklistPath = normalizePath(`${folder}/_checklist.md`)
      const exists = await this.app.vault.adapter.exists(checklistPath)
      if (!exists) {
        return {
          kind: 'unavailable',
          reason: `Checklist file not found at ${checklistPath}`,
        }
      }
      const result = await this.reviewIndex.verifyChecklistPhase(folder, phase)
      if (result.complete) {
        return { kind: 'complete', warnings: result.warnings }
      } else {
        return { kind: 'pending', remaining: result.remaining }
      }
    } catch (error) {
      return {
        kind: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
