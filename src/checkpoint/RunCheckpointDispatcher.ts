import { App, TFile, TFolder, normalizePath } from 'obsidian'

import { diskHash } from '../provider/interop/commitDisk'
import type { ConfigFolders } from '../security/vaultPathPolicy'

import {
  BinaryCheckpointManager,
  type BinaryCheckpointRecord,
  toArrayBuffer,
} from './BinaryCheckpointManager'
import { checkpointListing } from './checkpointListing'
import type { CheckpointItem } from './checkpointListing'
import { CheckpointManager } from './CheckpointManager'
import { cleanCheckpoints } from './cleanCheckpoints'
import { listCheckpointItems } from './listCheckpointItems'
import {
  type ProviderCheckpointEntry,
  type ProviderCheckpointRecord,
  ProviderCheckpointStore,
} from './ProviderCheckpointStore'
import { restoreLatestText } from './restoreLatestText'
import {
  type ApproveTextRollback,
  TextRollbackSkipped,
  restoreTextWithApproval,
} from './TextRollbackGuard'

export type RollbackSkipReason =
  /** A commit whose outcome was never established. Nothing is overwritten on a guess. */
  | 'approval-rejected'
  | 'changed-during-approval'
  | 'unsettled'
  | 'in-progress'
  /** The file no longer holds what the commit wrote. */
  | 'changed-after-save'
  | 'primary-skipped'
  | 'newer-change-kept'
  | 'folder-not-empty'
  /** A binary checkpoint made before the host recorded what it wrote. */
  | 'legacy-no-after-hash'
export type RollbackReport = {
  runId: string
  checkpointId: string
  restored: string[]
  skipped: { path: string; reason: RollbackSkipReason }[]
  failed: { path: string; reason: string }[]
}
export type CheckpointListing = {
  kind: 'text' | 'provider' | 'binary'
  id: string
  runId: string
  createdAt: string
  paths: string[]
  /** Provider commits only. */
  state?: ProviderCheckpointRecord['state']
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Restores checkpoints newest first. Provider/binary writes require after-hash
 * agreement; legacy text requires observed-state approval. Kept paths block
 * every older checkpoint, and reports contain only verified outcomes. */
export class RunCheckpointDispatcher {
  private rollingBack = false
  constructor(
    private readonly app: App,
    private readonly text: CheckpointManager,
    private readonly provider: ProviderCheckpointStore,
    private readonly binary: BinaryCheckpointManager,
    /** True while a commit on this path has not settled. */
    private readonly locked: (path: string) => boolean = () => false,
    private readonly approveText: ApproveTextRollback = async () => false,
    private readonly config?: {
      folders: () => ConfigFolders
      restored: (...paths: string[]) => void
    },
  ) {}

  private async items(
    runId: string,
    includeRestored = false,
  ): Promise<CheckpointItem[]> {
    return listCheckpointItems(
      this.text,
      this.provider,
      this.binary,
      runId,
      includeRestored,
    )
  }

  async list(runId: string): Promise<CheckpointListing[]> {
    return (await this.items(runId)).map((item) =>
      checkpointListing(item, runId),
    )
  }

  /** The latest checkpoint is a barrier even when it cannot be restored. */
  async restoreLastChange(runId: string, signal?: AbortSignal) {
    if (this.rollingBack) throw new Error('A rollback is already in progress.')
    this.rollingBack = true
    try {
      return await restoreLatestText(await this.items(runId, true), {
        app: this.app,
        text: this.text,
        locked: this.locked,
        approve: this.approveText,
        config: this.config,
        signal,
      })
    } finally {
      this.rollingBack = false
    }
  }

  /** Restores one checkpoint, or every checkpoint of the run newest first. */
  async rollback(
    runId: string,
    checkpointId?: string,
  ): Promise<RollbackReport | null> {
    if (this.rollingBack) throw new Error('A rollback is already in progress.')
    this.rollingBack = true
    try {
      return await this.rollbackItems(runId, checkpointId)
    } finally {
      this.rollingBack = false
    }
  }

  private async rollbackItems(
    runId: string,
    checkpointId?: string,
  ): Promise<RollbackReport | null> {
    const all = await this.items(runId)
    const items = checkpointId
      ? all.filter((item) => item.id === checkpointId)
      : all
    if (!items.length) return null
    const report: RollbackReport = {
      runId,
      checkpointId: items[0].id,
      restored: [],
      skipped: [],
      failed: [],
    }
    // A path that kept a newer change keeps it against every older checkpoint too.
    const kept = new Set<string>()
    for (const item of items) {
      if (item.kind === 'provider')
        await this.restoreProvider(item.record, report, kept)
      else if (item.kind === 'binary')
        await this.restoreBinary(item.record, report, kept)
      else if (item.paths.some((path) => kept.has(path)))
        item.paths.forEach((path) => {
          kept.add(path)
          report.skipped.push({ path, reason: 'newer-change-kept' })
        })
      else
        try {
          await restoreTextWithApproval(
            this.app,
            this.text,
            item.record,
            this.locked,
            this.approveText,
            this.config?.folders(),
          )
          this.config?.restored(...item.paths)
          report.restored.push(...item.paths)
        } catch (error) {
          item.paths.forEach((path) => {
            kept.add(path)
            if (error instanceof TextRollbackSkipped)
              report.skipped.push({ path, reason: error.reason })
            else report.failed.push({ path, reason: message(error) })
          })
          // Never apply older checkpoints over a half-restored newer one.
          if (!(error instanceof TextRollbackSkipped)) break
        }
    }
    return report
  }

  private async restoreProvider(
    record: ProviderCheckpointRecord,
    report: RollbackReport,
    kept: Set<string>,
  ): Promise<void> {
    const skip = (
      entry: ProviderCheckpointEntry,
      reason: RollbackSkipReason,
    ) => {
      kept.add(entry.path)
      entry.restore = 'skipped'
      report.skipped.push({ path: entry.path, reason })
    }
    const fail = (entry: ProviderCheckpointEntry, error: unknown) => {
      kept.add(entry.path)
      entry.restore = 'failed'
      report.failed.push({ path: entry.path, reason: message(error) })
    }
    if (record.state === 'pending' || record.state === 'unknown') {
      record.entries.forEach((entry) => skip(entry, 'unsettled'))
      return
    }
    const pending = record.entries.filter(
      (entry) => entry.state === 'written' && entry.restore !== 'restored',
    )
    if (!pending.length) return
    if (record.entries.some((entry) => this.locked(entry.path))) {
      pending.forEach((entry) => skip(entry, 'in-progress'))
      return
    }
    const files = pending.flatMap((entry) =>
      entry.kind === 'file' ? [entry] : [],
    )
    // Every snapshot is read and verified before the first file is touched.
    const snapshots = new Map<string, Uint8Array>()
    try {
      for (const entry of files)
        if (entry.existedBefore)
          snapshots.set(entry.path, await this.provider.snapshot(record, entry))
    } catch (error) {
      files.forEach((entry) => fail(entry, error))
      await this.provider.save(record).catch(() => undefined)
      return
    }
    // The document first; its derived files only once the document is back.
    let primaryKept = false
    for (const entry of [...files].sort(
      (a, b) => Number(b.role === 'primary') - Number(a.role === 'primary'),
    )) {
      if (kept.has(entry.path)) skip(entry, 'newer-change-kept')
      else if (entry.role === 'derived' && primaryKept)
        skip(entry, 'primary-skipped')
      else if (
        !entry.afterHash ||
        (await diskHash(this.app, entry.path).catch(() => undefined)) !==
          entry.afterHash
      )
        skip(entry, 'changed-after-save')
      else
        try {
          const before = snapshots.get(entry.path)
          if (before)
            await this.app.vault.adapter.writeBinary(
              normalizePath(entry.path),
              toArrayBuffer(before),
            )
          else await this.trash(entry.path)
          if ((await diskHash(this.app, entry.path)) !== entry.beforeHash)
            throw new Error('복원한 뒤 읽은 내용이 체크포인트와 다릅니다.')
          entry.restore = 'restored'
          report.restored.push(entry.path)
        } catch (error) {
          fail(entry, error)
        }
      if (entry.role === 'primary' && entry.restore !== 'restored')
        primaryKept = true
    }
    // Folders this commit created, deepest first, only when nothing is left in them.
    const folders = pending
      .filter((entry) => entry.kind === 'folder')
      .sort((a, b) => b.path.length - a.path.length)
    for (const entry of folders) {
      const path = normalizePath(entry.path)
      try {
        if (await this.app.vault.adapter.exists(path)) {
          const inside = await this.app.vault.adapter.list(path)
          if (inside.files.length || inside.folders.length) {
            skip(entry, 'folder-not-empty')
            continue
          }
          // Not rmdir(path, false): on Windows desktop it fails on every folder.
          await this.trash(path)
        }
        entry.restore = 'restored'
        report.restored.push(entry.path)
      } catch (error) {
        fail(entry, error)
      }
    }
    await this.provider.save(record).catch(() => undefined)
  }

  /** A file or emptied folder this commit created goes to the trash the user configured, never straight to deletion. */
  private async trash(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path))
    if (file instanceof TFile || file instanceof TFolder)
      await this.app.fileManager.trashFile(file)
    else await this.app.vault.adapter.trashLocal(normalizePath(path))
  }

  private async restoreBinary(
    record: BinaryCheckpointRecord,
    report: RollbackReport,
    kept: Set<string>,
  ): Promise<void> {
    if (record.restoredAt) return
    const skip = (reason: RollbackSkipReason) =>
      record.entries.forEach((entry) => {
        kept.add(entry.path)
        report.skipped.push({ path: entry.path, reason })
      })
    if (record.entries.some((entry) => kept.has(entry.path)))
      return skip('newer-change-kept')
    if (record.entries.some((entry) => !entry.afterHash))
      return skip('legacy-no-after-hash')
    for (const entry of record.entries)
      if (
        (await diskHash(this.app, entry.path).catch(() => undefined)) !==
        entry.afterHash
      )
        return skip('changed-after-save')
    try {
      await this.binary.restore(record.runId, record.id)
      await this.binary.markRestored(record).catch(() => undefined)
      report.restored.push(...record.entries.map((entry) => entry.path))
    } catch (error) {
      record.entries.forEach((entry) => {
        kept.add(entry.path)
        report.failed.push({ path: entry.path, reason: message(error) })
      })
    }
  }

  /**
   * Retention: text checkpoints by their own policy; provider commits by age,
   * except those whose outcome is not established (they are the only record of
   * what may have been written).
   */
  async clean(
    now = Date.now(),
  ): Promise<{ removed: number; freedBytes: number }> {
    return cleanCheckpoints(this.text, this.provider, now)
  }
}
