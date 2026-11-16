import type { ProviderCheckpointRecord } from './ProviderCheckpointStore'

const states = new Set([
  'pending',
  'written',
  'not_written',
  'partial',
  'unknown',
])
const itemStates = new Set([
  'pending',
  'written',
  'unchanged',
  'not_written',
  'unknown',
])
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reject malformed records before they can be used as evidence for a write. */
export function validCheckpointManifest(
  value: unknown,
  runId: string,
  id: string,
): value is ProviderCheckpointRecord {
  if (
    !object(value) ||
    value.contentKind !== 'provider-commit' ||
    value.schemaVersion !== 1 ||
    value.runId !== runId ||
    value.id !== id ||
    (value.revision !== undefined &&
      (!Number.isSafeInteger(value.revision) ||
        (value.revision as number) < 0)) ||
    ![
      'createdAt',
      'providerId',
      'tool',
      'destination',
      'preparationId',
      'preparationDigest',
      'ticketId',
    ].every((key) => typeof value[key] === 'string') ||
    !['overwrite', 'save_as', 'create'].includes(value.mode as string) ||
    !states.has(value.state as string) ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isFinite(value.sizeBytes) ||
    value.sizeBytes < 0 ||
    !Array.isArray(value.entries)
  )
    return false
  return value.entries.every((entry: unknown) => {
    if (
      !object(entry) ||
      typeof entry.path !== 'string' ||
      !itemStates.has(entry.state as string)
    )
      return false
    if (entry.kind === 'folder') return true
    return (
      entry.kind === 'file' &&
      ['primary', 'derived'].includes(entry.role as string) &&
      typeof entry.existedBefore === 'boolean' &&
      (entry.beforeHash === null || typeof entry.beforeHash === 'string') &&
      (entry.snapshotRef === null || typeof entry.snapshotRef === 'string') &&
      typeof entry.expectedHash === 'string' &&
      (entry.afterHash === undefined || typeof entry.afterHash === 'string')
    )
  })
}
