import { App, normalizePath } from 'obsidian'

import {
  type ManifestReadReason,
  readManifest,
} from './providerCheckpointManifests'
import type { ProviderCheckpointRecord } from './ProviderCheckpointStore'

export async function scanManifests(app: App, root: string, runId?: string) {
  const adapter = app.vault.adapter
  const records: ProviderCheckpointRecord[] = []
  const unreadable: {
    runId: string
    id: string
    reason: ManifestReadReason
  }[] = []
  let complete = true
  let listingFailed = false
  const last = (path: string) => path.split('/').filter(Boolean).pop() ?? ''
  try {
    if (!(await adapter.exists(normalizePath(root))))
      return { records, unreadable, complete, listingFailed }
    const runs = runId
      ? [runId]
      : (await adapter.list(normalizePath(root))).folders.map(last)
    for (const run of runs) {
      const dir = normalizePath(`${root}/${run}`)
      try {
        if (!(await adapter.exists(dir))) continue
        for (const folder of (await adapter.list(dir)).folders) {
          const id = last(folder)
          const result = await readManifest(app, folder, run, id)
          if (result.kind === 'ok') records.push(result.record)
          else {
            complete = false
            unreadable.push({
              runId: run,
              id,
              reason: result.kind === 'missing' ? 'read_failed' : result.reason,
            })
          }
        }
      } catch {
        complete = false
        listingFailed = true
      }
    }
  } catch {
    complete = false
    listingFailed = true
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { records, unreadable, complete, listingFailed }
}
