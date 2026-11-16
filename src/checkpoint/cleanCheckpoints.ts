import { type CheckpointManager, DEFAULT_RETENTION } from './CheckpointManager'
import type { ProviderCheckpointStore } from './ProviderCheckpointStore'

export async function cleanCheckpoints(
  text: CheckpointManager,
  provider: ProviderCheckpointStore,
  now: number,
): Promise<{ removed: number; freedBytes: number }> {
  const result = await text.clean()
  const maxAge = DEFAULT_RETENTION.maxAgeDays * 24 * 60 * 60 * 1000
  for (const record of await provider.list()) {
    if (record.state === 'pending' || record.state === 'unknown') continue
    if (now - Date.parse(record.createdAt) <= maxAge) continue
    await provider.remove(record)
    result.removed += 1
    result.freedBytes += record.sizeBytes
  }
  return result
}
