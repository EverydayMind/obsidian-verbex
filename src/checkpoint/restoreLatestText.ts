import type { App } from 'obsidian'

import type { ConfigFolders } from '../security/vaultPathPolicy'

import type { CheckpointItem } from './checkpointListing'
import type { CheckpointManager } from './CheckpointManager'
import {
  isRestorableBinary,
  isRestorableProviderEntry,
} from './restorableCheckpoint'
import type { RollbackReport } from './RunCheckpointDispatcher'
import {
  type ApproveTextRollback,
  TextRollbackSkipped,
  restoreTextWithApproval,
} from './TextRollbackGuard'

type Result = {
  state: 'none' | 'unsupported' | 'restored' | 'rejected' | 'failed'
  report?: RollbackReport
  omitted?: number
  changed?: string[]
  remainingCount?: number
  remainingPaths?: string[]
}

function summarizeRemainingChanges(earlier: CheckpointItem[]): {
  remainingCount: number
  remainingPaths: string[]
} {
  let remainingCount = 0
  const remainingPaths = new Set<string>()
  for (const item of earlier) {
    if (item.kind === 'text') {
      if (item.record.restoredAt || !item.record.appliedAt) continue
      const applied = item.record.entries.filter(
        (entry) => entry.afterHash !== undefined,
      )
      if (!applied.length) continue
      remainingCount += 1
      for (const entry of applied) {
        remainingPaths.add(entry.path)
        if (entry.originalPath) remainingPaths.add(entry.originalPath)
      }
    } else if (item.kind === 'provider') {
      if (item.record.state === 'pending' || item.record.state === 'unknown')
        continue
      const pending = item.record.entries.filter(isRestorableProviderEntry)
      if (!pending.length) continue
      remainingCount += 1
      for (const entry of pending) remainingPaths.add(entry.path)
    } else if (isRestorableBinary(item.record)) {
      remainingCount += 1
      for (const entry of item.record.entries) remainingPaths.add(entry.path)
    }
  }
  return { remainingCount, remainingPaths: [...remainingPaths] }
}
export async function restoreLatestText(
  items: CheckpointItem[],
  deps: {
    app: App
    text: CheckpointManager
    locked: (path: string) => boolean
    approve: ApproveTextRollback
    signal?: AbortSignal
    config?: {
      folders: () => ConfigFolders
      restored: (...paths: string[]) => void
    }
  },
): Promise<Result> {
  const latest = items[0]
  if (!latest) return { state: 'none' }
  if (latest.kind !== 'text' || !latest.record.appliedAt)
    return { state: 'unsupported' }
  if (
    latest.record.batchId &&
    items.filter(
      (item) =>
        item.kind === 'text' && item.record.batchId === latest.record.batchId,
    ).length > 1
  )
    return { state: 'unsupported' }
  if (latest.record.restoredAt) return { state: 'none' }
  const entries = latest.record.entries.filter(
    (entry) => entry.afterHash !== undefined,
  )
  if (!entries.length) return { state: 'unsupported' }
  const paths = entries.flatMap((entry) =>
    entry.originalPath ? [entry.path, entry.originalPath] : [entry.path],
  )
  const report: RollbackReport = {
    runId: latest.record.runId,
    checkpointId: latest.id,
    restored: [],
    skipped: [],
    failed: [],
  }
  let changed: string[] = []
  try {
    await restoreTextWithApproval(
      deps.app,
      deps.text,
      latest.record,
      deps.locked,
      async (request) => {
        changed = request.paths
          .filter((path) => path.changedAfterApply)
          .map((path) => path.path)
        return deps.approve(request)
      },
      deps.config?.folders(),
      true,
      deps.signal,
    )
    deps.config?.restored(...paths)
    report.restored.push(...paths)
    const remaining = summarizeRemainingChanges(items.slice(1))
    return {
      state: 'restored',
      report,
      changed,
      omitted: latest.record.entries.length - entries.length,
      ...(remaining.remainingCount > 0 ? remaining : {}),
    }
  } catch (error) {
    if (error instanceof TextRollbackSkipped) {
      report.skipped.push(
        ...paths.map((path) => ({ path, reason: error.reason })),
      )
      return {
        state: error.reason === 'approval-rejected' ? 'rejected' : 'failed',
        report,
      }
    }
    report.failed.push(
      ...paths.map((path) => ({
        path,
        reason: error instanceof Error ? error.message : String(error),
      })),
    )
    return { state: 'failed', report }
  }
}
