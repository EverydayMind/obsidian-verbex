import { normalizePath } from 'obsidian'

import {
  CheckpointInput,
  CheckpointManager,
} from '../checkpoint/CheckpointManager'
import type { CompositeApplier } from '../core/tidy/tidyApply'
import {
  PermissionDecision,
  PermissionManager,
} from '../permissions/PermissionManager'
import { issueApplyPermit } from '../security/promptInjectionBoundary'
import { DiffBlock } from '../utils/chat/diff'
import { ChangeApproval, ProposedChange } from '../verbex/types'

import { prepareBatchEntries } from './batchPreparation'
import {
  binaryDependencyConflict,
  requiresWholeRejection,
  validateBatchApproval,
} from './binaryDependencies'
import { ChangeApplier } from './changeApplier'
import {
  buildApproval,
  computeChangeBlocks,
  duplicateChangeIds,
  rejectedApproval,
  resolveApprovedContent,
} from './changeSet'
import { applyAndRecord } from './recordAppliedChange'

/**
 * Applies a step's proposed changes through the M5 safety pipeline (PRD §11/§12):
 *
 *   permission decision → (Diff + approval | Auto Mode) → checkpoint → apply
 *
 * The interactive approval is injected (`approve`) so the React Diff view drives
 * real runs while tests drive it deterministically. A change is never written
 * without first taking a checkpoint when one is required; a checkpoint failure
 * aborts that write.
 */

export type ChangeOutcomeStatus =
  | 'applied'
  | 'partially_applied'
  | 'rejected'
  | 'denied'
  | 'conflict'
  | 'checkpoint_failed'
  | 'apply_failed'

export type ChangeOutcome = {
  change: ProposedChange
  status: ChangeOutcomeStatus
  approval?: ChangeApproval
  checkpointId?: string
  /** Content actually written (null for delete); undefined when nothing applied. */
  appliedContent?: string | null
  reason?: string
  error?: string
  /** Readback facts a composite apply reported (links updated, leftovers). */
  applyNotes?: string[]
  links?: { updated: number; unchanged: number; broken: number; total: number }
}

export type ApproveRequest = {
  change: ProposedChange
  decision: PermissionDecision
  blocks: DiffBlock[]
}

export type ApproveFn = (request: ApproveRequest) => Promise<ChangeApproval>

/**
 * Reviews several changes at once, returning one approval per request in the
 * same order. Powers the multi-file Diff view; falls back to per-change
 * approval when unset.
 */
export type ApproveBatchFn = (
  requests: ApproveRequest[],
) => Promise<ChangeApproval[]>

export type ProcessBatchOptions = {
  /**
   * Approve non-dangerous vault writes in code without opening the Diff view or
   * waiting for the Auto Mode countdown. Permission decisions, checkpoints,
   * conflict detection, and apply errors still use the normal safety pipeline.
   * Dangerous changes always stay on the interactive approval path.
   */
  silentSafeApproval?: boolean
  signal?: AbortSignal
  onOutcome?: (outcome: ChangeOutcome, index: number) => void
}

export type StepExecutorDeps = {
  permissions: PermissionManager
  checkpoints: CheckpointManager
  applier: ChangeApplier
  /** Interactive Diff approval. Required for changes that need explicit review. */
  approve?: ApproveFn
  /** Multi-file Diff approval, used by processBatch when available. */
  approveBatch?: ApproveBatchFn
  /**
   * Auto Mode countdown hook: resolves false if the user cancelled before the
   * timeout. When omitted, auto-applied changes proceed.
   */
  autoConfirm?: (change: ProposedChange) => Promise<boolean>
  /** Applies `ProposedChange.composite` write sets (note tidy). */
  compositeApplier?: CompositeApplier
}

/** Normalise line endings to LF so CRLF files on Windows do not cause
 *  false-positive conflict reports when the LLM emits LF-only output. */
function normalizeLF(text: string | null): string | null {
  return text === null ? null : text.replace(/\r\n/g, '\n')
}

export class StepExecutor {
  constructor(private deps: StepExecutorDeps) {}

  /** Wire the interactive Diff approval handler (set by the Diff view at runtime). */
  setApprovalHandler(approve: ApproveFn | undefined): void {
    this.deps.approve = approve
  }

  setBatchApprovalHandler(approveBatch: ApproveBatchFn | undefined): void {
    this.deps.approveBatch = approveBatch
  }

  setAutoConfirm(
    autoConfirm: ((change: ProposedChange) => Promise<boolean>) | undefined,
  ): void {
    this.deps.autoConfirm = autoConfirm
  }

  /** Run every change in order, stopping nothing — each yields its own outcome. */
  async processChanges(
    runId: string,
    changes: ProposedChange[],
  ): Promise<ChangeOutcome[]> {
    changes = structuredClone(changes)
    const outcomes: ChangeOutcome[] = []
    for (const change of changes) {
      outcomes.push(await this.processChange(runId, change))
    }
    return outcomes
  }

  async processChange(
    runId: string,
    change: ProposedChange,
  ): Promise<ChangeOutcome> {
    change = structuredClone(change)
    const decision = this.deps.permissions.decideForChange(change)

    if (decision.action === 'deny') {
      return { change, status: 'denied', reason: decision.reason }
    }

    const blocks = computeChangeBlocks(change)
    const approval = structuredClone(
      await this.resolveApproval(change, decision, blocks),
    )
    return this.applyApproved(runId, change, decision, blocks, approval)
  }

  /**
   * Review and apply a set of changes as one batch (multi-file Diff). Approvals
   * for the changes needing review are gathered up front (one Diff session),
   * then each change is checkpointed and applied in order.
   */
  async processBatch(
    runId: string,
    changes: ProposedChange[],
    options: ProcessBatchOptions = {},
  ): Promise<ChangeOutcome[]> {
    options.signal?.throwIfAborted()
    changes = structuredClone(changes)
    const duplicateIds = duplicateChangeIds(changes)
    const prepared = prepareBatchEntries(changes, this.deps.permissions)
    const entries = Array.isArray(prepared) ? prepared : await prepared

    const silentlyApproved = (entry: (typeof entries)[number]): boolean =>
      options.silentSafeApproval === true &&
      entry.decision.alwaysExplicit !== true &&
      entry.change.composite === undefined &&
      entry.decision.category === 'write' &&
      !entry.decision.dangerous &&
      entry.decision.action !== 'deny'

    const reviewEntries = entries.filter(
      (entry) =>
        entry.decision.action !== 'deny' &&
        entry.decision.action !== 'allow' &&
        !silentlyApproved(entry),
    )

    const reviewApprovals = new Map<number, ChangeApproval>()
    if (reviewEntries.length > 0) {
      const requests: ApproveRequest[] = reviewEntries.map((entry) =>
        structuredClone({
          change: entry.change,
          decision: entry.decision,
          blocks: entry.blocks,
        }),
      )
      const approvals = this.deps.approveBatch
        ? await this.deps.approveBatch(requests)
        : await this.resolveApprovalsSequentially(reviewEntries)
      reviewEntries.forEach((entry, index) => {
        const approval = structuredClone(
          approvals[index] ??
            rejectedApproval(entry.change, 'No approval given.'),
        )
        reviewApprovals.set(entries.indexOf(entry), approval)
      })
    }

    // (1.1) Pre-resolve all approvals so we know which changes will actually be
    // applied, then create ONE shared batch checkpoint for all of them before
    // touching the vault. This ensures a rollback restores every file in the
    // batch, not just the last one.
    const preResolvedApprovals: (ChangeApproval | null)[] = entries.map(
      ({ change, decision, blocks }, i) => {
        if (decision.action === 'deny') return null
        if (decision.action === 'allow') {
          return buildApproval(change, blocks, [], decision.reason)
        }
        if (silentlyApproved(entries[i])) {
          return buildApproval(
            change,
            blocks,
            [],
            'Batch option: silently approved safe write.',
          )
        }
        return (
          reviewApprovals.get(i) ??
          rejectedApproval(change, 'No approval given.')
        )
      },
    )
    entries.forEach(({ change }, index) => {
      preResolvedApprovals[index] = validateBatchApproval(
        change,
        preResolvedApprovals[index],
        duplicateIds,
      )
    })

    // Server-side composition tools capture source bodies when they build a
    // proposal. Preflight every approved dependency before the shared
    // checkpoint is created. A source that is also mutated by this batch would
    // become stale after the first apply, so the whole approved batch is
    // rejected before any vault mutation in either case.
    const activeEntries = entries
      .map((entry, index) => ({ ...entry, index }))
      .filter(
        ({ decision, index }) =>
          decision.action !== 'deny' &&
          preResolvedApprovals[index] !== null &&
          preResolvedApprovals[index]?.status !== 'rejected',
      )
    const batchMutationPaths = new Set<string>()
    activeEntries.forEach(({ change }) => {
      batchMutationPaths.add(normalizePath(change.path))
      if (change.originalPath)
        batchMutationPaths.add(normalizePath(change.originalPath))
    })
    let dependencyBatchConflict: string | null = null
    for (const { change } of activeEntries) {
      dependencyBatchConflict = await binaryDependencyConflict(
        change,
        this.deps.applier,
        batchMutationPaths,
      )
      if (dependencyBatchConflict) break
      for (const dependency of change.sourceDependencies ?? []) {
        const dependencyPath = normalizePath(dependency.path)
        if (batchMutationPaths.has(dependencyPath)) {
          dependencyBatchConflict = `Batch source dependency overlaps a mutated path: "${dependency.path}".`
          break
        }
        const conflict = await this.detectSourceDependencyConflict(
          change,
          dependency,
        )
        if (conflict) {
          dependencyBatchConflict = conflict
          break
        }
      }
      if (dependencyBatchConflict) break
    }
    if (dependencyBatchConflict) {
      return entries.map(({ change, decision }, index) => {
        if (decision.action === 'deny')
          return { change, status: 'denied' as const, reason: decision.reason }
        const approval = preResolvedApprovals[index]
        if (!approval || approval.status === 'rejected')
          return {
            change,
            status: 'rejected' as const,
            approval: approval ?? undefined,
            reason: approval?.reason,
          }
        return {
          change,
          status: 'conflict' as const,
          approval,
          reason: dependencyBatchConflict,
        }
      })
    }

    let batchCheckpointId: string | undefined
    const checkpointedIndices = new Set<number>()
    const batchCheckpointInputs: CheckpointInput[] = []

    for (let i = 0; i < entries.length; i++) {
      const { change, decision } = entries[i]
      const approval = preResolvedApprovals[i]
      if (
        !decision.requiresCheckpoint ||
        !approval ||
        approval.status === 'rejected'
      ) {
        continue
      }
      checkpointedIndices.add(i)
      batchCheckpointInputs.push({
        op: change.op,
        path: change.path,
        originalPath: change.originalPath,
        before: change.before,
      })
    }

    options.signal?.throwIfAborted()
    if (batchCheckpointInputs.length > 0) {
      try {
        // Assign a stable batchId so the checkpoint can be identified as part
        // of this batch (vs. an individual single-change checkpoint). Format:
        // "<runId>-batch-<timestamp>" — unique within a run, human-readable.
        const batchId = `${runId}-batch-${Date.now()}`
        const record = await this.deps.checkpoints.create(
          runId,
          batchCheckpointInputs,
          batchId,
        )
        batchCheckpointId = record.id
      } catch (error) {
        // Checkpoint failed: abort the entire batch without touching the vault.
        const errMsg = error instanceof Error ? error.message : String(error)
        return entries.map(({ change, decision }, i) => {
          if (decision.action === 'deny') {
            return {
              change,
              status: 'denied' as const,
              reason: decision.reason,
            }
          }
          const approval = preResolvedApprovals[i]
          if (!approval || approval.status === 'rejected') {
            return {
              change,
              status: 'rejected' as const,
              approval: approval ?? undefined,
              reason: approval?.reason,
            }
          }
          return {
            change,
            status: 'checkpoint_failed' as const,
            approval,
            error: errMsg,
          }
        })
      }
    }

    // Apply each change, passing the shared checkpoint ID so individual
    // checkpoint creation is skipped for already-checkpointed entries.
    const outcomes: ChangeOutcome[] = []
    for (let i = 0; i < entries.length; i++) {
      options.signal?.throwIfAborted()
      const { change, decision, blocks } = entries[i]
      if (decision.action === 'deny') {
        outcomes.push({ change, status: 'denied', reason: decision.reason })
        options.onOutcome?.(outcomes[outcomes.length - 1], i)
        continue
      }
      const approval =
        preResolvedApprovals[i] ??
        rejectedApproval(change, 'No approval given.')
      outcomes.push(
        await this.applyApproved(
          runId,
          change,
          decision,
          blocks,
          approval,
          checkpointedIndices.has(i) ? batchCheckpointId : undefined,
        ),
      )
      options.onOutcome?.(outcomes[outcomes.length - 1], i)
    }

    return outcomes
  }

  private async resolveApprovalsSequentially(
    entries: {
      change: ProposedChange
      decision: PermissionDecision
      blocks: DiffBlock[]
    }[],
  ): Promise<ChangeApproval[]> {
    const approvals: ChangeApproval[] = []
    for (const entry of entries) {
      approvals.push(
        await this.resolveApproval(entry.change, entry.decision, entry.blocks),
      )
    }
    return approvals
  }

  private async applyApproved(
    runId: string,
    change: ProposedChange,
    decision: PermissionDecision,
    blocks: DiffBlock[],
    approval: ChangeApproval,
    /**
     * Pre-built batch checkpoint ID supplied by {@link processBatch}. When set,
     * this change's snapshot is already included in that checkpoint and individual
     * checkpoint creation is skipped.
     */
    prebuiltCheckpointId?: string,
  ): Promise<ChangeOutcome> {
    if (approval.changeId !== change.id) {
      const rejected = rejectedApproval(
        change,
        'Approval does not match this change.',
      )
      return {
        change,
        status: 'rejected',
        approval: rejected,
        reason: rejected.reason,
      }
    }
    if (requiresWholeRejection(change, approval)) {
      return {
        change,
        status: 'rejected',
        approval,
        reason: 'Whole-change approval required; partial approval rejected.',
      }
    }
    if (approval.status === 'rejected') {
      return { change, status: 'rejected', approval, reason: approval.reason }
    }
    if (change.composite)
      return this.applyComposite(runId, change, decision, approval)

    // Full approval preserves the exact proposal; display Diff blocks can lose
    // blank lines. Only partial approval reconstructs the accepted hunks.
    const content =
      change.op === 'delete'
        ? null
        : approval.rejectedHunks.length === 0
          ? change.after
          : resolveApprovedContent(blocks, approval.rejectedHunks)

    const beforeCheckpointConflict = await this.detectConflict(change)
    if (beforeCheckpointConflict)
      return {
        change,
        status: 'conflict',
        approval,
        reason: beforeCheckpointConflict,
      }

    // Use the pre-built batch checkpoint when one was supplied; otherwise create
    // an individual checkpoint for this change alone.
    let checkpointId: string | undefined = prebuiltCheckpointId
    if (!checkpointId && decision.requiresCheckpoint) {
      try {
        const record = await this.deps.checkpoints.create(runId, [
          {
            op: change.op,
            path: change.path,
            originalPath: change.originalPath,
            before: change.before,
          },
        ])
        checkpointId = record.id
      } catch (error) {
        return {
          change,
          status: 'checkpoint_failed',
          approval,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // Re-check after the checkpoint is durable and immediately before issuing
    // the one-shot apply permit. This reduces (but cannot eliminate external
    // editor) TOCTOU races.
    const conflict = await this.detectConflict(change)
    if (conflict) {
      return {
        change,
        status: 'conflict',
        approval,
        checkpointId,
        reason: conflict,
      }
    }

    try {
      await applyAndRecord(this.deps.applier, this.deps.checkpoints, {
        runId,
        checkpointId,
        change,
        content,
      })
    } catch (error) {
      return {
        change,
        status: 'apply_failed',
        approval,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    return {
      change,
      status:
        approval.status === 'partial_approved'
          ? 'partially_applied'
          : 'applied',
      approval,
      checkpointId,
      appliedContent: content,
    }
  }

  /**
   * A composite change is one approval over a whole predicted write set: every
   * entry is conflict-checked, checkpointed together, re-checked, and only then
   * handed to the composite applier under one apply permit.
   */
  private async applyComposite(
    runId: string,
    change: ProposedChange,
    decision: PermissionDecision,
    approval: ChangeApproval,
  ): Promise<ChangeOutcome> {
    const composite = change.composite
    const applier = this.deps.compositeApplier
    if (!composite || !applier)
      return {
        change,
        status: 'apply_failed',
        approval,
        error: 'No composite applier is configured.',
      }
    if (approval.rejectedHunks.length > 0)
      return {
        change,
        status: 'rejected',
        approval,
        reason: 'Whole-change approval required; partial approval rejected.',
      }
    const conflict = async () => {
      for (const entry of composite.entries) {
        const path = entry.originalPath ?? entry.path
        const current = await this.deps.applier.readCurrent(path)
        if (normalizeLF(current) === normalizeLF(entry.before)) continue
        return entry.before === null
          ? `Conflict: "${path}" now exists but the change assumed a new file; not overwriting.`
          : current === null
            ? `Conflict: "${path}" was removed since the change was proposed.`
            : `Conflict: "${path}" was edited since the change was proposed; not overwriting to avoid losing that edit.`
      }
      return null
    }
    const early = await conflict()
    if (early) return { change, status: 'conflict', approval, reason: early }
    let checkpointId: string | undefined
    if (decision.requiresCheckpoint) {
      try {
        const record = await this.deps.checkpoints.create(
          runId,
          composite.entries.map((entry) => ({
            op: entry.op,
            path: entry.path,
            originalPath: entry.originalPath,
            before: entry.before,
          })),
          `${runId}-composite-${Date.now()}`,
        )
        checkpointId = record.id
      } catch (error) {
        return {
          change,
          status: 'checkpoint_failed',
          approval,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    const late = await conflict()
    if (late)
      return {
        change,
        status: 'conflict',
        approval,
        checkpointId,
        reason: late,
      }
    try {
      const execution = await issueApplyPermit(change, runId)
      const report = await applier.apply(change, execution, {
        runId,
        turnId: `apply-${change.id}`,
      })
      return {
        change,
        status: report.partial ? 'partially_applied' : 'applied',
        approval,
        checkpointId,
        appliedContent: change.after,
        links: report.links,
        ...(report.notes.length ? { applyNotes: report.notes } : {}),
      }
    } catch (error) {
      return {
        change,
        status: 'apply_failed',
        approval,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Returns a human-readable reason when the file's current content no longer
   * matches the pre-change content the proposal was built from, or null when it
   * is safe to apply. `change.before` describes the source file (`originalPath`
   * for rename/move, otherwise `path`); null means the proposal expected the
   * file not to exist yet.
   */
  private async detectConflict(change: ProposedChange): Promise<string | null> {
    const sourcePath = change.originalPath ?? change.path
    const current = await this.deps.applier.readCurrent(sourcePath)
    // (2.1) Normalise line endings on both sides before comparing. On Windows,
    // Obsidian may return CRLF while the LLM produces LF-only output, causing
    // identical content to be reported as a conflict.
    if (normalizeLF(current) !== normalizeLF(change.before)) {
      if (change.before === null) {
        return `Conflict: "${sourcePath}" now exists but the change assumed a new file; not overwriting.`
      }
      if (current === null) {
        return `Conflict: "${sourcePath}" was removed since the change was proposed; not re-creating it.`
      }
      return `Conflict: "${sourcePath}" was edited since the change was proposed; not overwriting to avoid losing that edit.`
    }
    for (const dependency of change.sourceDependencies ?? []) {
      const conflict = await this.detectSourceDependencyConflict(
        change,
        dependency,
      )
      if (conflict) return conflict
    }
    return binaryDependencyConflict(change, this.deps.applier)
  }

  private async detectSourceDependencyConflict(
    change: ProposedChange,
    dependency: NonNullable<ProposedChange['sourceDependencies']>[number],
  ): Promise<string | null> {
    const current = await this.deps.applier.readCurrent(dependency.path)
    if (normalizeLF(current) === normalizeLF(dependency.beforeContent))
      return null
    if (dependency.beforeContent === null)
      return `Conflict: source dependency "${dependency.path}" now exists but the composition proposal assumed it was absent.`
    if (current === null)
      return `Conflict: source dependency "${dependency.path}" was removed since the composition proposal was built.`
    return `Conflict: source dependency "${dependency.path}" changed since the composition proposal was built; not applying stale composed content for "${change.path}".`
  }

  private async resolveApproval(
    change: ProposedChange,
    decision: PermissionDecision,
    blocks: DiffBlock[],
  ): Promise<ChangeApproval> {
    if (decision.action === 'allow') {
      return buildApproval(change, blocks, [], decision.reason)
    }

    if (decision.action === 'auto_apply') {
      // Prefer the Diff view (it shows the countdown + a reject button); fall
      // back to a headless confirm, and to silent auto-apply when neither is set.
      if (this.deps.approve) {
        return this.deps.approve(structuredClone({ change, decision, blocks }))
      }
      const confirmed = this.deps.autoConfirm
        ? await this.deps.autoConfirm(structuredClone(change))
        : true
      return confirmed
        ? buildApproval(change, blocks, [], 'Auto Mode')
        : {
            changeId: change.id,
            status: 'rejected',
            approvedHunks: [],
            rejectedHunks: [],
            reason: 'Auto Mode cancelled by user.',
          }
    }

    // require_approval
    if (!this.deps.approve) {
      return {
        changeId: change.id,
        status: 'rejected',
        approvedHunks: [],
        rejectedHunks: [],
        reason: 'No approval handler available; change not applied.',
      }
    }
    return this.deps.approve(structuredClone({ change, decision, blocks }))
  }
}
