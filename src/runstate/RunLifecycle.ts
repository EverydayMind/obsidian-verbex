import { App, normalizePath } from 'obsidian'

import { CheckpointManager } from '../checkpoint/CheckpointManager'
import type {
  RollbackReport,
  RunCheckpointDispatcher,
} from '../checkpoint/RunCheckpointDispatcher'
import type {
  ContextPackerDeferState,
  ExecutionPlanSnapshot,
} from '../core/batch/contextPacker'
import { PlanTracker } from '../plan/PlanTracker'
import { runtimeTimers } from '../platform/runtime'
import type { VerbexSettings } from '../settings/schema/setting.types'
import { summarizeOutcome } from '../utils/changeOutcome'
import { openMarkdownFile } from '../utils/obsidian'
import { hasRegisteredView } from '../utils/registeredView'
import {
  CheckpointRecord,
  VerbexPlanStep,
  VerbexRunState,
  VerbexStatusSnapshot,
} from '../verbex/types'
import { nowIso } from '../verbex/vault'
import { ChangeOutcome } from '../workflow/StepExecutor'

import { MutationActivity } from './mutationActivity'
import { rebaseRun } from './rebaseRun'
import { RunArtifactStore } from './RunArtifactStore'
import { RunStateRepository } from './RunStateRepository'
import type { TurnRecord } from './turnLedger'
import { storeRunBodiesEnabled } from './turnRecordProjection'

export type StatusListener = (snapshot: VerbexStatusSnapshot) => void

export class RunLifecycle {
  readonly mutationActivity = new MutationActivity()
  private listeners: StatusListener[] = []
  /** Set once the provider checkpoint stores exist. Rollback and cleanup go through it. */
  dispatcher?: RunCheckpointDispatcher

  constructor(
    private app: App,
    private repository: RunStateRepository,
    private checkpoints: CheckpointManager,
    private snapshot: VerbexStatusSnapshot,
    private onOpenAppliedNote?: (path: string) => Promise<void>,
    private getSettings?: () => VerbexSettings,
  ) {}

  getSnapshot(): VerbexStatusSnapshot {
    return this.snapshot
  }

  setSnapshot(snapshot: VerbexStatusSnapshot): void {
    this.snapshot = snapshot
  }

  addStatusListener(listener: StatusListener): () => void {
    this.listeners.push(listener)
    listener(this.snapshot)
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener)
    }
  }

  private freshRun(
    runId: string,
    fallbackTitle: string,
    fallbackPlan: VerbexPlanStep[] = PlanTracker.createAdhocPlan(fallbackTitle),
  ): VerbexRunState {
    const now = nowIso()
    return {
      schemaVersion: 2,
      id: runId,
      status: 'created',
      title: fallbackTitle.trim().slice(0, 80) || runId,
      createdAt: now,
      updatedAt: now,
      skill: null,
      workflow: null,
      plan: fallbackPlan,
      currentStepId:
        fallbackPlan.find((step) => step.status === 'pending')?.id ?? null,
      logs: [],
      artifacts: {},
      checkpoints: [],
    }
  }

  async loadRunForUpdate(
    runId: string,
    fallbackTitle: string,
    fallbackPlan?: VerbexPlanStep[],
  ): Promise<VerbexRunState> {
    const existing =
      this.snapshot.activeRun?.id === runId
        ? this.snapshot.activeRun
        : await this.repository.read(`${runId}.json`)
    return existing ?? this.freshRun(runId, fallbackTitle, fallbackPlan)
  }

  private async refreshSnapshot(saved: VerbexRunState): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      activeRun:
        this.snapshot.activeRun?.id === saved.id || !this.snapshot.activeRun
          ? saved
          : this.snapshot.activeRun,
      pausedRuns: await this.repository.findLatestPaused(),
      lastError: null,
    }
    this.emit()
  }

  /**
   * Transactional read-modify-write of one run. `mutate` sees the latest
   * persisted state (falling back to the in-memory active run, then a fresh
   * run) and must be pure; the snapshot is refreshed from what was saved.
   */
  private async updateRun(
    runId: string,
    fallbackTitle: string,
    mutate: (base: VerbexRunState) => VerbexRunState | null,
  ): Promise<VerbexRunState | null> {
    const saved = await this.repository.updateRun(runId, (latest) =>
      mutate(
        latest ??
          (this.snapshot.activeRun?.id === runId
            ? this.snapshot.activeRun
            : this.freshRun(runId, fallbackTitle)),
      ),
    )
    if (saved) await this.refreshSnapshot(saved)
    return saved
  }

  async saveRunAndUpdateSnapshot(run: VerbexRunState): Promise<void> {
    await this.refreshSnapshot(await this.repository.saveRun(run))
  }

  /**
   * Saves a run derived from `base` (what the caller loaded) without erasing
   * changes other writers persisted since: see rebaseRun.
   */
  async saveRunRebased(
    base: VerbexRunState,
    updated: VerbexRunState,
  ): Promise<void> {
    const saved = await this.repository.updateRun(updated.id, (latest) =>
      latest ? rebaseRun(base, updated, latest) : updated,
    )
    if (saved) await this.refreshSnapshot(saved)
  }

  /** Append only to a live persisted run; never revive a deleted run on abort. */
  async persistAbortedTurn(runId: string, record: TurnRecord): Promise<void> {
    const saved = await this.repository.updateRun(runId, (latest) =>
      !latest ||
      RunArtifactStore.getTurnLedger(latest).records.some(
        (item) => record.executionId && item.executionId === record.executionId,
      )
        ? null
        : RunArtifactStore.appendTurnRecord(latest, record, {
            storeRunBodies: this.getSettings
              ? storeRunBodiesEnabled(this.getSettings())
              : false,
          }),
    )
    if (saved) await this.refreshSnapshot(saved)
  }

  /** Save completion artifacts even if this execution's abort was already recorded. */
  async saveAgentTurn(
    base: VerbexRunState,
    updated: VerbexRunState,
    record: TurnRecord,
  ): Promise<void> {
    const saved = await this.repository.updateRun(updated.id, (latest) => {
      // The agent turn can run for minutes: rebase so checkpoint links and tool
      // outcomes saved meanwhile survive this final write.
      const rebased = latest ? rebaseRun(base, updated, latest) : updated
      if (
        latest &&
        RunArtifactStore.getTurnLedger(latest).records.some(
          (item) =>
            record.executionId && item.executionId === record.executionId,
        )
      )
        return rebased
      return RunArtifactStore.appendTurnRecord(rebased, record, {
        storeRunBodies: this.getSettings
          ? storeRunBodiesEnabled(this.getSettings())
          : false,
      })
    })
    if (saved) await this.refreshSnapshot(saved)
  }

  async updateRunArtifacts(
    runId: string,
    mutate: (run: VerbexRunState) => VerbexRunState,
    title = 'Update run artifacts',
  ): Promise<void> {
    await this.updateRun(runId, title, (base) => {
      const updated = mutate(base)
      return JSON.stringify(base.artifacts) ===
        JSON.stringify(updated.artifacts) && base.status === updated.status
        ? null
        : updated
    })
  }

  /** Context-packer state an agent turn starts from. */
  async loadContextState(runId: string) {
    const run = await this.loadRunForUpdate(runId, 'Context packet plan')
    return {
      deferState: RunArtifactStore.getContextPackerDeferState(run),
      turns: RunArtifactStore.getTurnLedger(run).records,
    }
  }

  async persistContextPackerDeferState(
    runId: string,
    state: ContextPackerDeferState,
  ): Promise<void> {
    await this.updateRunArtifacts(runId, (run) =>
      RunArtifactStore.setContextPackerDeferState(run, state),
    )
  }

  async persistContextExecutionPlan(
    runId: string,
    snapshot: ExecutionPlanSnapshot,
  ): Promise<void> {
    await this.updateRunArtifacts(runId, (run) =>
      RunArtifactStore.setContextExecutionPlan(run, snapshot),
    )
  }

  uniqueCheckpoints(existing: string[], outcomes: ChangeOutcome[]): string[] {
    const ids = new Set(existing)
    for (const outcome of outcomes) {
      if (outcome.checkpointId) ids.add(outcome.checkpointId)
    }
    return [...ids]
  }

  async recordToolOutcome(
    runId: string,
    outcome: ChangeOutcome,
    options: { openAppliedNotes?: boolean } = {},
  ): Promise<void> {
    const isTerminalUtilityRun = this.snapshot.activeRun?.id !== runId
    const ok =
      outcome.status === 'applied' || outcome.status === 'partially_applied'
    await this.updateRun(runId, `Tool run: ${runId}`, (base) => ({
      ...base,
      status: isTerminalUtilityRun ? (ok ? 'completed' : 'error') : base.status,
      checkpoints: this.uniqueCheckpoints(base.checkpoints, [outcome]),
      artifacts: {
        ...base.artifacts,
        last_tool_outcome: summarizeOutcome(outcome),
      },
      logs: [
        ...base.logs,
        {
          timestamp: nowIso(),
          level: ok ? 'info' : 'warn',
          message: summarizeOutcome(outcome),
        },
      ],
    }))
    if (
      ok &&
      options.openAppliedNotes !== false &&
      outcome.change.op !== 'delete' &&
      outcome.change.tool !== 'build_treaty_wiki' &&
      outcome.change.tool !== 'build_review_index'
    ) {
      await (this.onOpenAppliedNote?.(outcome.change.path) ??
        this.openAppliedNote(outcome.change.path))
    }
  }

  async listCheckpoints(runId?: string): Promise<CheckpointRecord[]> {
    return this.checkpoints.list(runId)
  }

  async getRunTitle(runId: string): Promise<string | undefined> {
    return (await this.repository.read(`${runId}.json`))?.title
  }

  async cleanCheckpoints(): Promise<{ removed: number; freedBytes: number }> {
    return this.dispatcher ? this.dispatcher.clean() : this.checkpoints.clean()
  }

  /**
   * Registers a provider commit checkpoint with its run before the provider
   * may write. Resolves only after the run file was saved.
   */
  async linkCheckpoint(runId: string, checkpointId: string): Promise<void> {
    const active = this.snapshot.activeRun?.id === runId
    await this.updateRun(runId, `Tool run: ${runId}`, (base) => ({
      ...base,
      // A run made only to hold this checkpoint is not something to resume.
      status: !active && base.status === 'created' ? 'completed' : base.status,
      checkpoints: [...new Set([...base.checkpoints, checkpointId])],
    }))
  }

  async rollbackRun(
    runId?: string,
    checkpointId?: string,
  ): Promise<{
    runId: string
    checkpointId: string
    report?: RollbackReport
  } | null> {
    const targetRunId = runId ?? this.snapshot.activeRun?.id
    if (!targetRunId) return null
    if (this.dispatcher) {
      const report = await this.dispatcher.rollback(targetRunId, checkpointId)
      return (
        report && {
          runId: report.runId,
          checkpointId: report.checkpointId,
          report,
        }
      )
    }
    throw new Error('Rollback dispatcher is not ready; no files were restored.')
  }

  async pauseActiveRun(): Promise<VerbexRunState | null> {
    const activeRun = this.snapshot.activeRun
    if (!activeRun) return null
    // Pause the latest persisted state, not a possibly stale snapshot copy.
    return this.updateRun(activeRun.id, activeRun.title, (base) => ({
      ...base,
      status: 'paused' as const,
    }))
  }

  getUnreadableRunCount(): number {
    return this.repository.getListDiagnostics().length
  }

  async getResumableRuns(): Promise<VerbexRunState[]> {
    return this.repository.findResumable()
  }

  async resumeRun(runId?: string): Promise<VerbexRunState | null> {
    const resumable = await this.repository.findResumable()
    const target = runId
      ? (resumable.find((run) => run.id === runId) ?? null)
      : (resumable[0] ?? null)
    if (!target) return null
    return this.updateRun(target.id, target.title, (base) =>
      PlanTracker.syncRunWithPlan(
        { ...base, status: 'in_progress' },
        base.plan,
      ),
    )
  }

  async openAppliedNote(path: string): Promise<void> {
    try {
      const normalized = normalizePath(path)
      const extension =
        normalized.split('/').pop()?.split('.').slice(1).pop() ?? ''
      const registry = (this.app as App & { viewRegistry?: unknown })
        .viewRegistry
      if (!hasRegisteredView(registry, extension)) return
      let file = this.app.vault.getFileByPath(normalized)
      for (let attempt = 0; attempt < 20 && !file; attempt += 1) {
        await new Promise<void>((resolve) =>
          runtimeTimers.setTimeout(resolve, 50),
        )
        file = this.app.vault.getFileByPath(normalized)
      }
      if (file) openMarkdownFile(this.app, normalized)
    } catch {
      // Opening a changed note is best-effort UX only.
    }
  }

  emit(): void {
    for (const listener of this.listeners) listener(this.snapshot)
  }
}
