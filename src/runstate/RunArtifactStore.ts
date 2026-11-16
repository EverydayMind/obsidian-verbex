import type {
  ContextPackerDeferState,
  ExecutionPlanSnapshot,
} from '../core/batch/contextPacker'
import type { CoverageLedger } from '../core/routing/coverage'
import {
  VerbexRunState,
  WorkflowCoverageEntry,
  WorkflowRuntimeState,
} from '../verbex/types'

import { TURN_LEDGER_LIMIT, TurnLedger, TurnRecord } from './turnLedger'
import { projectTurnRecord } from './turnRecordProjection'

/** Upper bound on notes carried as workflow review scope across turns. */
const WORKFLOW_REVIEW_SCOPE_ARTIFACT = 'workflow_review_scope'
const WORKFLOW_RUNTIME_ARTIFACT = 'workflow_runtime_state'
const WORKFLOW_COVERAGE_ARTIFACT = 'workflow_coverage_ledger'
const WORKFLOW_COVERAGE_V2_ARTIFACT = 'workflow_coverage_ledger_v2'
const WORKFLOW_REVIEW_CURSOR_ARTIFACT = 'workflow_review_cursor'
const CONTEXT_PACKER_DEFER_STATE_ARTIFACT = 'context_packer_defer_state'
const CONTEXT_EXECUTION_PLAN_ARTIFACT = 'context_execution_plan'

export class RunArtifactStore {
  static getTurnLedger(run: VerbexRunState): TurnLedger {
    try {
      const parsed = JSON.parse(
        run.artifacts.turn_ledger_v1 ?? 'null',
      ) as TurnLedger | null
      if (
        parsed?.v === 1 &&
        Array.isArray(parsed.records) &&
        parsed.records.every(
          (r) =>
            r.v === 1 &&
            typeof r.turnId === 'string' &&
            Array.isArray(r.evidence?.discovered) &&
            Array.isArray(r.evidence?.inspected) &&
            Array.isArray(r.evidence?.omitted) &&
            Array.isArray(r.toolCalls) &&
            Array.isArray(r.truncations) &&
            Array.isArray(r.writes),
        )
      )
        return {
          v: 1,
          records: parsed.records.slice(-TURN_LEDGER_LIMIT),
          droppedTurns:
            Math.max(0, parsed.droppedTurns || 0) +
            Math.max(0, parsed.records.length - TURN_LEDGER_LIMIT),
        }
    } catch {
      /* legacy or corrupt artifact */
    }
    return { v: 1, records: [], droppedTurns: 0 }
  }

  static appendTurnRecord(
    run: VerbexRunState,
    record: TurnRecord,
    options: { storeRunBodies: boolean } = { storeRunBodies: false },
  ): VerbexRunState {
    const ledger = this.getTurnLedger(run)
    const bounded = {
      ...projectTurnRecord(record, options.storeRunBodies),
      ...(record.documentJobPending && {
        documentJobPending: record.documentJobPending.map(
          ({ draft_contract: _contract, ...job }) => job,
        ),
      }),
      evidence: {
        discovered: record.evidence.discovered.slice(0, 200),
        inspected: record.evidence.inspected.slice(0, 200),
        omitted: record.evidence.omitted.slice(0, 200),
      },
    }
    const records = [...ledger.records, bounded]
    const dropped = Math.max(0, records.length - TURN_LEDGER_LIMIT)
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        last_turn_status: record.stoppedReason,
        turn_ledger_v1: JSON.stringify({
          v: 1,
          records: records.slice(-TURN_LEDGER_LIMIT),
          droppedTurns: ledger.droppedTurns + dropped,
        }),
      },
    }
  }

  static migrateRunState(
    run: Omit<VerbexRunState, 'schemaVersion'> & { schemaVersion?: number },
  ): VerbexRunState {
    const artifacts = { ...run.artifacts }
    if (!artifacts.index_folder && artifacts.wiki_folder) {
      artifacts.index_folder = artifacts.wiki_folder
    }
    delete artifacts.wiki_folder
    return { ...run, schemaVersion: 2, artifacts }
  }

  static needsMigration(run: {
    schemaVersion?: number
    artifacts: Record<string, string>
  }): boolean {
    return run.schemaVersion !== 2 || 'wiki_folder' in run.artifacts
  }

  /**
   * getWorkflowRuntimeState
   * Owner: TurnPlanner / WorkflowCoordinator
   * Owner: WorkflowCoordinator
   */
  static getWorkflowRuntimeState(
    run: VerbexRunState,
  ): WorkflowRuntimeState | null {
    const raw = run.artifacts[WORKFLOW_RUNTIME_ARTIFACT]
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<WorkflowRuntimeState>
      return {
        workflowGoal: parsed.workflowGoal ?? '',
        turnIntent: parsed.turnIntent ?? '',
        activeWorkflowId: parsed.activeWorkflowId ?? '',
        activeStepId: parsed.activeStepId ?? '',
        stepStatus: parsed.stepStatus ?? 'pending',
        stepStatuses: parsed.stepStatuses ?? {},
        approvedAt: parsed.approvedAt,
      }
    } catch {
      return null
    }
  }

  static setWorkflowRuntimeState(
    run: VerbexRunState,
    state: WorkflowRuntimeState,
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [WORKFLOW_RUNTIME_ARTIFACT]: JSON.stringify(state),
      },
    }
  }

  /**
   * getWorkflowCoverageLedger
   * Owner: WorkflowCoordinator
   * Owner: WorkflowCoordinator
   */
  static getWorkflowCoverageLedger(
    run: VerbexRunState,
  ): WorkflowCoverageEntry[] | null {
    const raw = run.artifacts[WORKFLOW_COVERAGE_ARTIFACT]
    if (!raw) return null
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as WorkflowCoverageEntry[]) : null
    } catch {
      return null
    }
  }

  static setWorkflowCoverageLedger(
    run: VerbexRunState,
    ledger: WorkflowCoverageEntry[],
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [WORKFLOW_COVERAGE_ARTIFACT]: JSON.stringify(ledger),
      },
    }
  }

  /**
   * Generalized coverage view for workflow runs. The legacy checklist-shaped
   * ledger remains alongside this artifact for backwards compatibility and
   * UI consumers that still address article ids.
   */
  static getWorkflowCoverageLedgerV2(
    run: VerbexRunState,
  ): CoverageLedger | null {
    const raw = run.artifacts[WORKFLOW_COVERAGE_V2_ARTIFACT]
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as {
        version?: unknown
        ledger?: Partial<CoverageLedger>
      }
      const ledger = parsed.ledger
      if (
        parsed.version !== 2 ||
        ledger?.schemaVersion !== 1 ||
        !ledger.coverage ||
        !Array.isArray(ledger.records)
      ) {
        return null
      }
      return ledger as CoverageLedger
    } catch {
      return null
    }
  }

  static setWorkflowCoverageLedgerV2(
    run: VerbexRunState,
    ledger: CoverageLedger,
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [WORKFLOW_COVERAGE_V2_ARTIFACT]: JSON.stringify({
          version: 2,
          ledger,
        }),
      },
    }
  }

  /**
   * getWorkflowReviewCursor
   * Owner: WorkflowCoordinator
   * Owner: WorkflowCoordinator
   */
  static getWorkflowReviewCursor(run: VerbexRunState): unknown {
    const raw = run.artifacts[WORKFLOW_REVIEW_CURSOR_ARTIFACT]
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  static setWorkflowReviewCursor(
    run: VerbexRunState,
    cursor: unknown,
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [WORKFLOW_REVIEW_CURSOR_ARTIFACT]: JSON.stringify(cursor),
      },
    }
  }

  static getContextPackerDeferState(
    run: VerbexRunState,
  ): ContextPackerDeferState {
    const empty: ContextPackerDeferState = {
      version: 1,
      packetIds: [],
      coverageUnitIds: [],
    }
    const raw = run.artifacts[CONTEXT_PACKER_DEFER_STATE_ARTIFACT]
    if (!raw) return empty
    try {
      const parsed = JSON.parse(raw) as Partial<ContextPackerDeferState>
      if (parsed.version !== 1) return empty
      return {
        version: 1,
        packetIds: uniqueNonEmptyStrings(parsed.packetIds),
        coverageUnitIds: uniqueNonEmptyStrings(parsed.coverageUnitIds),
      }
    } catch {
      return empty
    }
  }

  static setContextPackerDeferState(
    run: VerbexRunState,
    state: ContextPackerDeferState,
  ): VerbexRunState {
    const packetIds = uniqueNonEmptyStrings(state.packetIds)
    const coverageUnitIds = uniqueNonEmptyStrings(state.coverageUnitIds)
    const artifacts = { ...run.artifacts }
    if (packetIds.length === 0 && coverageUnitIds.length === 0) {
      delete artifacts[CONTEXT_PACKER_DEFER_STATE_ARTIFACT]
    } else {
      artifacts[CONTEXT_PACKER_DEFER_STATE_ARTIFACT] = JSON.stringify({
        version: 1,
        packetIds,
        coverageUnitIds,
      })
    }
    return { ...run, artifacts }
  }

  static getContextExecutionPlan(
    run: VerbexRunState,
  ): ExecutionPlanSnapshot | null {
    const raw = run.artifacts[CONTEXT_EXECUTION_PLAN_ARTIFACT]
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<ExecutionPlanSnapshot>
      const legacyExecutor =
        parsed.executor === undefined
          ? parsed.execution === 'batch' && parsed.scope === 'whole'
            ? 'map_reduce'
            : 'interactive'
          : parsed.executor
      if (
        parsed.version !== 1 ||
        (parsed.scope !== 'targeted' && parsed.scope !== 'whole') ||
        !['interactive', 'unit_batch', 'map_reduce', 'capacity_error'].includes(
          legacyExecutor,
        ) ||
        !Array.isArray(parsed.packetIds) ||
        !Array.isArray(parsed.includedPacketIds) ||
        !Array.isArray(parsed.deferredPacketIds) ||
        !Array.isArray(parsed.deferredCoverageUnitIds) ||
        !Array.isArray(parsed.droppedPacketIds)
      ) {
        return null
      }
      return { ...parsed, executor: legacyExecutor } as ExecutionPlanSnapshot
    } catch {
      return null
    }
  }

  static setContextExecutionPlan(
    run: VerbexRunState,
    snapshot: ExecutionPlanSnapshot,
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [CONTEXT_EXECUTION_PLAN_ARTIFACT]: JSON.stringify(snapshot),
      },
    }
  }

  /**
   * getWorkflowReviewScope
   * Owner: TurnPlanner / WorkflowCoordinator
   * Owner: WorkflowCoordinator
   */
  static getWorkflowReviewScope(run: VerbexRunState): string[] {
    const raw = run.artifacts[WORKFLOW_REVIEW_SCOPE_ARTIFACT]
    if (!raw) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((path): path is string => typeof path === 'string')
        : []
    } catch {
      return []
    }
  }

  static setWorkflowReviewScope(
    run: VerbexRunState,
    scope: string[],
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [WORKFLOW_REVIEW_SCOPE_ARTIFACT]: JSON.stringify(scope),
      },
    }
  }

  /**
   * getLargeDigest
   * Owner: LargeDocumentCoordinator
   * Owner: LargeDocumentCoordinator
   */
  static getLargeDigest(
    run: VerbexRunState,
    key: string,
  ): { text: string; metadata: Record<string, unknown> } | null {
    const text = run.artifacts[`${key}_digest`]
    const rawMetadata = run.artifacts[`${key}_metadata`]
    if (!text) return null
    try {
      const metadata: unknown = rawMetadata ? JSON.parse(rawMetadata) : null
      return {
        text,
        metadata:
          metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : {},
      }
    } catch {
      return { text, metadata: {} }
    }
  }

  static setLargeDigest(
    run: VerbexRunState,
    key: string,
    digest: { text: string; metadata: unknown },
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [`${key}_digest`]: digest.text,
        [`${key}_metadata`]: JSON.stringify(digest.metadata),
      },
    }
  }

  /**
   * getIndexFolder
   * Owner: ReviewIndexRuntime / ToolExecutionCoordinator
   * Run schema v2 stores only the canonical index_folder key.
   */
  static getIndexFolder(run: VerbexRunState): string | null {
    return run.artifacts.index_folder || null
  }

  static setIndexFolder(run: VerbexRunState, path: string): VerbexRunState {
    const artifacts: Record<string, string> = {
      ...run.artifacts,
      index_folder: path,
    }
    delete artifacts.wiki_folder
    return {
      ...run,
      artifacts,
    }
  }

  /**
   * getArtifact / setArtifact
   * ONLY allowed for dynamic output_artifact bindings mapped in workflow steps.
   * Direct calling of this generic fallback is bypassed raw run.artifacts indexer.
   */
  static getArtifact(run: VerbexRunState, key: string): string | null {
    return run.artifacts[key] || null
  }

  static setArtifact(
    run: VerbexRunState,
    key: string,
    value: string,
  ): VerbexRunState {
    return {
      ...run,
      artifacts: {
        ...run.artifacts,
        [key]: value,
      },
    }
  }
}

function uniqueNonEmptyStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string =>
              typeof item === 'string' && item.trim().length > 0,
          ),
        ),
      ]
    : []
}
