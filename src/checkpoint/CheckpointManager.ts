import { App, normalizePath } from 'obsidian'

import { VERBEX_DIR } from '../constants'
import { sha256Hex } from '../utils/hash'
import {
  CheckpointEntry,
  CheckpointRecord,
  FileChangeOp,
} from '../verbex/types'
import { ensureVaultDir, nowIso } from '../verbex/vault'

/**
 * Snapshots vault files before they are mutated so a run can be rolled back
 * (PRD §11). A checkpoint is written under
 * `.verbex/checkpoints/<runId>/<cpId>/` with a manifest plus one snapshot file
 * per pre-existing file. Content is hashed (SHA-256) so restores can be
 * verified and unchanged files skipped.
 *
 * A write must never proceed without its checkpoint: callers create the
 * checkpoint first and abort the write if `create` throws.
 */

export type CheckpointInput = {
  op: FileChangeOp
  /** Resulting path (new path for rename/move). */
  path: string
  /** Source path for rename/move/delete. */
  originalPath?: string
  /** Pre-change content; null when the file is being created. */
  before: string | null
}

export type RetentionPolicy = {
  maxAgeDays: number
  maxBytes: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  maxAgeDays: 7,
  maxBytes: 100 * 1024 * 1024,
}

type Hasher = (text: string) => Promise<string>

export class CheckpointManager {
  constructor(
    private app: App,
    private hasher: Hasher = sha256Hex,
  ) {}

  private get root(): string {
    return `${VERBEX_DIR}/checkpoints`
  }

  private runDir(runId: string): string {
    return `${this.root}/${runId}`
  }

  private checkpointDir(runId: string, checkpointId: string): string {
    return `${this.runDir(runId)}/${checkpointId}`
  }

  /**
   * Snapshot the pre-change state of every file in `inputs`. Returns the
   * persisted record; throws (so the caller aborts the write) on any failure.
   */
  async create(
    runId: string,
    inputs: CheckpointInput[],
    /** Optional batch identifier. Set by processBatch to group batch checkpoints. */
    batchId?: string,
  ): Promise<CheckpointRecord> {
    const checkpointId = `cp-${nowIso().replace(/[:.]/g, '-')}`
    const dir = this.checkpointDir(runId, checkpointId)
    await ensureVaultDir(this.app, `${dir}/files`)

    const entries: CheckpointEntry[] = []
    let sizeBytes = 0

    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i]
      const sourcePath = input.originalPath ?? input.path
      if (input.before === null) {
        // Newly created file: nothing to snapshot; restore = delete.
        entries.push({
          path: input.path,
          originalPath: input.originalPath,
          op: input.op,
          beforeHash: null,
          snapshotRef: null,
        })
        continue
      }
      const snapshotRef = `files/${i}.snap`
      await this.app.vault.adapter.write(
        normalizePath(`${dir}/${snapshotRef}`),
        input.before,
      )
      sizeBytes += input.before.length
      entries.push({
        path: input.path,
        originalPath: sourcePath === input.path ? undefined : sourcePath,
        op: input.op,
        beforeHash: await this.hasher(input.before),
        snapshotRef,
      })
    }

    const record: CheckpointRecord = {
      id: checkpointId,
      runId,
      createdAt: nowIso(),
      entries,
      sizeBytes,
      ...(batchId !== undefined ? { batchId } : {}),
    }
    await this.app.vault.adapter.write(
      normalizePath(`${dir}/manifest.json`),
      JSON.stringify(record, null, 2),
    )
    return record
  }

  /**
   * Restore every file recorded in a checkpoint to its snapshotted state:
   * snapshot content is written back to the original path, created files are
   * deleted, and the post-change path of a rename/move is removed.
   *
   * Two safety properties matter for chained/overlapping changes (e.g.
   * `A → B` alongside `X → A`, or an `A ↔ B` swap):
   *
   *  - **Pre-flight**: every snapshot referenced by the manifest is read and
   *    verified against its recorded hash *before* any file is touched, so a
   *    missing/corrupt snapshot aborts the whole restore instead of leaving the
   *    vault half-reverted.
   *  - **Two-phase apply**: all post-change paths (created files + rename/move
   *    destinations) are removed first, then every snapshot is written back to
   *    its original path. Deleting before writing means one entry can never
   *    clobber a file another entry just restored, regardless of entry order.
   */
  async restore(
    runId: string,
    checkpointId: string,
    beforeApply?: (record: CheckpointRecord) => Promise<void>,
    appliedOnly = false,
    signal?: AbortSignal,
  ): Promise<void> {
    const record = await this.read(runId, checkpointId)
    if (!record) {
      throw new Error(`Checkpoint ${checkpointId} not found for run ${runId}`)
    }
    const dir = this.checkpointDir(runId, checkpointId)
    const entries = appliedOnly
      ? record.entries.filter((entry) => entry.afterHash !== undefined)
      : record.entries

    // Pre-flight: load and validate every snapshot up front. Any failure here
    // throws before the vault is mutated, so restore is all-or-nothing.
    const restores: { targetPath: string; content: string }[] = []
    for (const entry of entries) {
      if (entry.snapshotRef === null) continue
      const snapshotPath = normalizePath(`${dir}/${entry.snapshotRef}`)
      if (!(await this.app.vault.adapter.exists(snapshotPath))) {
        throw new Error(
          `Checkpoint ${checkpointId} is incomplete: snapshot ${entry.snapshotRef} is missing; aborting restore before any change.`,
        )
      }
      const content = await this.app.vault.adapter.read(snapshotPath)
      if (entry.beforeHash !== null) {
        const actual = await this.hasher(content)
        if (actual !== entry.beforeHash) {
          throw new Error(
            `Checkpoint ${checkpointId} is corrupt: snapshot ${entry.snapshotRef} hash mismatch; aborting restore before any change.`,
          )
        }
      }
      restores.push({
        targetPath: entry.originalPath ?? entry.path,
        content,
      })
    }

    await beforeApply?.(record)

    // Phase 1: remove every post-change path (created files and the
    // destination of each rename/move). Done for all entries before any write.
    for (const entry of entries) {
      signal?.throwIfAborted()
      if (entry.snapshotRef === null) {
        // Was a create: undo by removing the file we created.
        await this.removeIfExists(entry.path)
        continue
      }
      if (entry.originalPath && entry.path !== entry.originalPath) {
        await this.removeIfExists(entry.path)
      }
    }

    // Phase 2: write validated snapshots back to their original paths.
    // On failure, report exactly which paths were restored and which were not so
    // the caller can surface a precise error rather than leaving the vault in a
    // silently inconsistent state (fix for 1.2: rollback Phase 2 instability).
    const restoredPaths: string[] = []
    for (const restore of restores) {
      signal?.throwIfAborted()
      try {
        await this.writeFile(restore.targetPath, restore.content)
        restoredPaths.push(restore.targetPath)
      } catch (err) {
        const failedPath = restore.targetPath
        const remaining = restores
          .map((r) => r.targetPath)
          .filter((p) => !restoredPaths.includes(p))
        const errMsg = err instanceof Error ? err.message : String(err)
        throw new Error(
          `Checkpoint restore ${checkpointId} partially failed while writing "${failedPath}": ${errMsg}. ` +
            `Restored: [${restoredPaths.join(', ')}]. ` +
            `Not restored: [${remaining.join(', ')}]. ` +
            'The vault may be in an inconsistent state — please inspect these files manually.',
        )
      }
    }
  }

  async markRestored(record: CheckpointRecord): Promise<void> {
    await this.app.vault.adapter.write(
      normalizePath(
        `${this.checkpointDir(record.runId, record.id)}/manifest.json`,
      ),
      JSON.stringify({ ...record, restoredAt: nowIso() }, null, 2),
    )
  }

  /** Record only successfully applied entries; recording failure must not undo an apply. */
  async recordApplied(
    runId: string,
    checkpointId: string,
    path: string,
    afterHash: string | null,
  ): Promise<void> {
    const record = await this.read(runId, checkpointId)
    if (!record) throw new Error(`Checkpoint ${checkpointId} not found`)
    const entry = record.entries.find((item) => item.path === path)
    if (!entry) throw new Error(`Checkpoint entry ${path} not found`)
    entry.afterHash = afterHash
    record.appliedAt = nowIso()
    await this.app.vault.adapter.write(
      normalizePath(`${this.checkpointDir(runId, checkpointId)}/manifest.json`),
      JSON.stringify(record, null, 2),
    )
  }

  async read(
    runId: string,
    checkpointId: string,
  ): Promise<CheckpointRecord | null> {
    const path = normalizePath(
      `${this.checkpointDir(runId, checkpointId)}/manifest.json`,
    )
    if (!(await this.app.vault.adapter.exists(path))) {
      return null
    }
    try {
      return JSON.parse(
        await this.app.vault.adapter.read(path),
      ) as CheckpointRecord
    } catch {
      return null
    }
  }

  /** All checkpoint records (optionally for one run), newest first. */
  async list(runId?: string): Promise<CheckpointRecord[]> {
    const runIds = runId ? [runId] : await this.listRunIds()
    const records: CheckpointRecord[] = []
    for (const id of runIds) {
      const dir = this.runDir(id)
      if (!(await this.app.vault.adapter.exists(normalizePath(dir)))) continue
      const listing = await this.app.vault.adapter.list(normalizePath(dir))
      for (const folder of listing.folders) {
        const checkpointId = folder.split('/').filter(Boolean).pop() ?? ''
        const record = await this.read(id, checkpointId)
        if (record) records.push(record)
      }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Remove checkpoints that violate the retention policy (age then size). */
  async clean(
    policy: RetentionPolicy = DEFAULT_RETENTION,
    now: number = Date.now(),
  ): Promise<{ removed: number; freedBytes: number }> {
    const records = await this.list()
    const toRemove = selectExpiredCheckpoints(records, policy, now)
    let freedBytes = 0
    for (const record of toRemove) {
      await this.removeCheckpointDir(record.runId, record.id)
      freedBytes += record.sizeBytes
    }
    return { removed: toRemove.length, freedBytes }
  }

  async listRunIds(): Promise<string[]> {
    if (!(await this.app.vault.adapter.exists(normalizePath(this.root)))) {
      return []
    }
    const listing = await this.app.vault.adapter.list(normalizePath(this.root))
    return listing.folders.map(
      (folder) => folder.split('/').filter(Boolean).pop() ?? '',
    )
  }

  private async removeCheckpointDir(
    runId: string,
    checkpointId: string,
  ): Promise<void> {
    const dir = normalizePath(this.checkpointDir(runId, checkpointId))
    // recursive: also drops the manifest + per-file snapshots beneath it.
    await this.app.vault.adapter.rmdir(dir, true)
  }

  private async removeIfExists(path: string): Promise<void> {
    const normalized = normalizePath(path)
    if (await this.app.vault.adapter.exists(normalized)) {
      await this.app.vault.adapter.remove(normalized)
    }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path)
    const dir = normalized.split('/').slice(0, -1).join('/')
    if (dir) await ensureVaultDir(this.app, dir)
    await this.app.vault.adapter.write(normalized, content)
  }
}

/**
 * Selects the checkpoints to delete under a retention policy: first everything
 * older than `maxAgeDays`, then — if the remaining snapshots still exceed
 * `maxBytes` — the oldest ones until the budget is met. Pure for testability.
 */
export function selectExpiredCheckpoints(
  records: CheckpointRecord[],
  policy: RetentionPolicy,
  now: number,
): CheckpointRecord[] {
  const oldestFirst = [...records].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  const remove = new Set<CheckpointRecord>()
  const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000

  for (const record of oldestFirst) {
    if (now - new Date(record.createdAt).getTime() > maxAgeMs) {
      remove.add(record)
    }
  }

  let total = oldestFirst
    .filter((record) => !remove.has(record))
    .reduce((sum, record) => sum + record.sizeBytes, 0)

  for (const record of oldestFirst) {
    if (total <= policy.maxBytes) break
    if (remove.has(record)) continue
    remove.add(record)
    total -= record.sizeBytes
  }

  return oldestFirst.filter((record) => remove.has(record))
}
