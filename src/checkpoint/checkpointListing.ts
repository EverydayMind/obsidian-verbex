import type { CheckpointRecord } from '../verbex/types'

import type { BinaryCheckpointRecord } from './BinaryCheckpointManager'
import type { ProviderCheckpointRecord } from './ProviderCheckpointStore'
import type { CheckpointListing } from './RunCheckpointDispatcher'

export type CheckpointItem = { id: string; createdAt: string } & (
  | { kind: 'text'; paths: string[]; record: CheckpointRecord }
  | { kind: 'provider'; record: ProviderCheckpointRecord }
  | { kind: 'binary'; record: BinaryCheckpointRecord }
)

export function checkpointListing(
  item: CheckpointItem,
  runId: string,
): CheckpointListing {
  return {
    kind: item.kind,
    id: item.id,
    runId,
    createdAt: item.createdAt,
    paths:
      item.kind === 'text'
        ? item.paths
        : item.record.entries.map((entry) => entry.path),
    ...(item.kind === 'provider' ? { state: item.record.state } : {}),
  }
}
