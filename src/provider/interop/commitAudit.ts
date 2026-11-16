import type { ProviderCheckpointRecord } from '../../checkpoint/ProviderCheckpointStore'

import type { CommitReceipt } from './commitProtocol'
import type { NativeCall } from './readExecution'

/** Bounded observations, never attribution. Paths stay in the local checkpoint. */
export function commitAudit(
  call: NativeCall,
  record: ProviderCheckpointRecord,
) {
  const allowed = new Map(record.entries.map((entry) => [entry.path, entry]))
  const note = (path: string, source: 'event' | 'receipt' | 'readback') => {
    const audit = (record.unexpectedChanges ??= {
      count: 0,
      paths: [],
      truncated: false,
    })
    audit.count++
    if (
      !audit.paths.some((item) => item.path === path && item.source === source)
    ) {
      if (audit.paths.length < 32 && path.length <= 4096)
        audit.paths.push({ path, source })
      else audit.truncated = true
    }
    call.reportFault?.()
    if (audit.count <= 32)
      call.trace?.mark('commit.unexpected', { path, count: audit.count })
  }
  return {
    event: (event: string, path: string, oldPath?: string) => {
      // Deletes/renames are not part of the commit protocol, even at an approved path.
      if (!allowed.has(path) || event === 'delete' || event === 'rename')
        note(path, 'event')
      if (oldPath && oldPath !== path) note(oldPath, 'event')
    },
    receipt: (receipt: CommitReceipt) => {
      for (const item of receipt.entries) {
        const entry = allowed.get(item.path)
        if (
          !entry ||
          entry.kind !== item.kind ||
          (entry.kind === 'file' &&
            item.sha256After !== undefined &&
            item.sha256After !== entry.afterHash)
        )
          note(item.path, 'receipt')
      }
    },
    readback: () => {
      for (const entry of record.entries)
        if (entry.state === 'unknown') note(entry.path, 'readback')
    },
  }
}
