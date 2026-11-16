import type { BinaryCheckpointManager } from './BinaryCheckpointManager'
import type { CheckpointItem } from './checkpointListing'
import type { CheckpointManager } from './CheckpointManager'
import type { ProviderCheckpointStore } from './ProviderCheckpointStore'

export async function listCheckpointItems(
  text: CheckpointManager,
  provider: ProviderCheckpointStore,
  binary: BinaryCheckpointManager,
  runId: string,
  includeRestored: boolean,
): Promise<CheckpointItem[]> {
  const items: CheckpointItem[] = [
    ...(await text.list(runId))
      .filter((record) => includeRestored || !record.restoredAt)
      .map((record) => ({
        record,
        kind: 'text' as const,
        id: record.id,
        createdAt: record.createdAt,
        paths: record.entries.flatMap((entry) =>
          entry.originalPath ? [entry.path, entry.originalPath] : [entry.path],
        ),
      })),
    ...(await provider.list(runId)).map((record) => ({
      kind: 'provider' as const,
      id: record.id,
      createdAt: record.createdAt,
      record,
    })),
    ...(await binary.list(runId)).map((record) => ({
      kind: 'binary' as const,
      id: record.id,
      createdAt: record.createdAt,
      record,
    })),
  ]
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
