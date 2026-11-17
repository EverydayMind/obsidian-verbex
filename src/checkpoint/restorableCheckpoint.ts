import type { BinaryCheckpointRecord } from './BinaryCheckpointManager'
import type { ProviderCheckpointEntry } from './ProviderCheckpointStore'

export function isRestorableProviderEntry(
  entry: ProviderCheckpointEntry,
): boolean {
  return entry.state === 'written' && entry.restore !== 'restored'
}

export function isRestorableBinary(record: BinaryCheckpointRecord): boolean {
  return !record.restoredAt
}
