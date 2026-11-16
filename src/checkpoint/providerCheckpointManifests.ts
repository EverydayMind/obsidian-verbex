import { App, normalizePath } from 'obsidian'

import type { ProviderCheckpointRecord } from './ProviderCheckpointStore'
import { validCheckpointManifest } from './providerCheckpointValidation'

export type ManifestReadReason =
  | 'read_failed'
  | 'parse_failed'
  | 'schema_unsupported'
type ReadResult =
  | {
      kind: 'ok'
      record: ProviderCheckpointRecord
      text: string
      source: 'main' | 'next'
    }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: ManifestReadReason }

type Adapter = App['vault']['adapter']
const locks = new WeakMap<App, Map<string, Promise<void>>>()

async function readOne(
  adapter: Adapter,
  file: string,
  runId: string,
  id: string,
  source: 'main' | 'next',
): Promise<ReadResult> {
  let data: string
  try {
    if (!(await adapter.exists(file))) return { kind: 'missing' }
    data = await adapter.read(file)
  } catch {
    return { kind: 'unreadable', reason: 'read_failed' }
  }
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return { kind: 'unreadable', reason: 'parse_failed' }
  }
  if (!validCheckpointManifest(value, runId, id))
    return { kind: 'unreadable', reason: 'schema_unsupported' }
  return {
    kind: 'ok',
    record: { ...value, revision: value.revision ?? 0 },
    text: data,
    source,
  }
}

export async function readManifest(
  app: App,
  dir: string,
  runId: string,
  id: string,
): Promise<ReadResult> {
  const [main, next] = await Promise.all([
    readOne(
      app.vault.adapter,
      normalizePath(`${dir}/manifest.json`),
      runId,
      id,
      'main',
    ),
    readOne(
      app.vault.adapter,
      normalizePath(`${dir}/manifest.next.json`),
      runId,
      id,
      'next',
    ),
  ])
  if (main.kind === 'ok' && next.kind === 'ok') {
    const mainRevision = main.record.revision ?? 0
    const nextRevision = next.record.revision ?? 0
    if (
      mainRevision === nextRevision &&
      JSON.stringify(main.record) !== JSON.stringify(next.record)
    )
      return { kind: 'unreadable', reason: 'schema_unsupported' }
    return nextRevision > mainRevision ? next : main
  }
  if (main.kind === 'ok') return main
  if (next.kind === 'ok') return next
  if (main.kind === 'unreadable') return main
  if (next.kind === 'unreadable') return next
  return { kind: 'missing' }
}

async function writeVerified(
  adapter: Adapter,
  file: string,
  data: string,
): Promise<void> {
  await adapter.write(file, data)
  if ((await adapter.read(file)) !== data)
    throw new Error('checkpoint manifest write verification failed')
}

export async function saveManifest(
  app: App,
  dir: string,
  record: ProviderCheckpointRecord,
): Promise<void> {
  // Capture the caller's facts before waiting for any earlier write.
  const snapshot = JSON.parse(
    JSON.stringify(record),
  ) as ProviderCheckpointRecord
  let byDir = locks.get(app)
  if (!byDir) {
    byDir = new Map()
    locks.set(app, byDir)
  }
  const previous = byDir.get(dir) ?? Promise.resolve()
  const work = previous
    .catch(() => undefined)
    .then(async () => {
      const current = await readManifest(app, dir, snapshot.runId, snapshot.id)
      if (current.kind === 'unreadable')
        throw new Error('checkpoint manifest unreadable')
      if (current.kind === 'missing' && snapshot.revision !== undefined)
        throw new Error('checkpoint manifest missing')
      if (
        current.kind === 'ok' &&
        (snapshot.revision ?? 0) !== (current.record.revision ?? 0)
      )
        throw new Error('stale checkpoint manifest revision')
      const main = normalizePath(`${dir}/manifest.json`)
      const next = normalizePath(`${dir}/manifest.next.json`)
      // Preserve the only newest copy before reusing its slot.
      if (current.kind === 'ok' && current.source === 'next')
        await writeVerified(app.vault.adapter, main, current.text)
      const revision =
        (current.kind === 'ok' ? (current.record.revision ?? 0) : 0) + 1
      const updated = { ...snapshot, revision }
      if (!validCheckpointManifest(updated, snapshot.runId, snapshot.id))
        throw new Error('invalid checkpoint manifest')
      const data = JSON.stringify(updated, null, 2)
      await writeVerified(app.vault.adapter, next, data)
      // Even if the final write fails, the verified next copy is already authoritative.
      record.revision = revision
      await writeVerified(app.vault.adapter, main, data)
    })
  byDir.set(dir, work)
  try {
    await work
  } finally {
    if (byDir.get(dir) === work) byDir.delete(dir)
  }
}
