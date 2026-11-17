import type { BinaryCheckpointManager } from './BinaryCheckpointManager'
import type { CheckpointManager } from './CheckpointManager'
import { listCheckpointItems } from './listCheckpointItems'
import type { ProviderCheckpointStore } from './ProviderCheckpointStore'
import {
  isRestorableBinary,
  isRestorableProviderEntry,
} from './restorableCheckpoint'

export type RestorableRun = {
  runId: string
  lastChangedAt: string
  checkpointCount: number
  paths: string[]
}

export async function listRestorableRuns(
  deps: {
    text: CheckpointManager
    provider: ProviderCheckpointStore
    binary: BinaryCheckpointManager
  },
  limit = 30,
): Promise<RestorableRun[]> {
  const { text, provider, binary } = deps
  const ids = new Set(
    (
      await Promise.all([
        text.listRunIds(),
        provider.listRunIds(),
        binary.listRunIds(),
      ])
    ).flat(),
  )
  const runs: RestorableRun[] = []
  for (const runId of ids) {
    const items = await listCheckpointItems(
      text,
      provider,
      binary,
      runId,
      false,
    )
    const remaining = items.flatMap((item) => {
      if (item.kind === 'text')
        return [{ createdAt: item.createdAt, paths: item.paths }]
      if (item.kind === 'binary')
        return isRestorableBinary(item.record)
          ? [
              {
                createdAt: item.createdAt,
                paths: item.record.entries.map((entry) => entry.path),
              },
            ]
          : []
      const entries =
        item.record.state === 'pending' || item.record.state === 'unknown'
          ? item.record.entries
          : item.record.entries.filter(isRestorableProviderEntry)
      return entries.length
        ? [
            {
              createdAt: item.createdAt,
              paths: entries.map((entry) => entry.path),
            },
          ]
        : []
    })
    if (remaining.length)
      runs.push({
        runId,
        lastChangedAt: remaining[0].createdAt,
        checkpointCount: remaining.length,
        paths: [...new Set(remaining.flatMap((item) => item.paths))].sort(),
      })
  }
  return runs
    .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt))
    .slice(0, Math.max(0, limit))
}
