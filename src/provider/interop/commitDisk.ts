import type { App } from 'obsidian'

import type {
  ProviderCheckpointRecord,
  ProviderCheckpointStore,
} from '../../checkpoint/ProviderCheckpointStore'
import { sha256HexBytes } from '../../utils/hash'

import {
  type CommitPreparation,
  type CommitState,
  overallState,
} from './commitProtocol'

/**
 * Bytes of a Vault file as they are on disk now, or null when there is no
 * such file. Paths here already passed the Vault path policy, which returns
 * them normalized. (No runtime import of `obsidian`: the interop host also
 * runs in the Node smoke scripts.)
 */
export async function readDiskBytes(
  app: App,
  path: string,
): Promise<Uint8Array | null> {
  if (!(await app.vault.adapter.exists(path))) return null
  return new Uint8Array(await app.vault.adapter.readBinary(path))
}

export async function diskHash(app: App, path: string): Promise<string | null> {
  const bytes = await readDiskBytes(app, path)
  return bytes ? sha256HexBytes(bytes) : null
}

/**
 * Compares the disk with the "before" side of a preparation. Returns the first
 * difference as a path, or undefined when everything is as it was prepared.
 * An observation at one moment; not a lock against other programs.
 */
export async function changedSincePrepared(
  app: App,
  preparation: CommitPreparation,
): Promise<string | undefined> {
  const { source, template } = preparation
  if (source && (await diskHash(app, source.path)) !== source.baseHash)
    return source.path
  if (template && (await diskHash(app, template.path)) !== template.sha256)
    return template.path
  for (const entry of preparation.writeSet) {
    if (entry.kind === 'folder') {
      if (await app.vault.adapter.exists(entry.path)) return entry.path
    } else if ((await diskHash(app, entry.path)) !== entry.sha256Before)
      return entry.path
  }
  return undefined
}

/**
 * Reads every entry of a commit back from disk and records what is there.
 * A matching hash is evidence of the observable state, not of who wrote it.
 */
export async function observeCommit(
  app: App,
  record: ProviderCheckpointRecord,
): Promise<CommitState> {
  for (const entry of record.entries) {
    try {
      if (entry.kind === 'folder') {
        if (!(await app.vault.adapter.exists(entry.path))) {
          entry.state = 'not_written'
        } else {
          const stat = await app.vault.adapter.stat(entry.path)
          entry.state = stat?.type === 'folder' ? 'written' : 'unknown'
        }
        continue
      }
      const hash = await diskHash(app, entry.path)
      if (hash === null) delete entry.afterHash
      else entry.afterHash = hash
      entry.state =
        hash === entry.expectedHash
          ? hash === entry.beforeHash
            ? 'unchanged'
            : 'written'
          : hash === entry.beforeHash
            ? 'not_written'
            : 'unknown'
    } catch {
      entry.state = 'unknown'
    }
  }
  return overallState(
    record.entries.map((entry) =>
      entry.state === 'pending' ? 'unknown' : entry.state,
    ),
  )
}

/**
 * After a restart: settles commits that were still `pending` by comparing the
 * disk with their before/expected hashes. Never calls a provider and never
 * writes a user file. `locked` skips commits that are running right now.
 */
export async function recoverPendingCommits(
  app: App,
  store: ProviderCheckpointStore,
  locked: (path: string) => boolean = () => false,
): Promise<ProviderCheckpointRecord[]> {
  const settled: ProviderCheckpointRecord[] = []
  for (const record of await store.list()) {
    if (record.state !== 'pending') continue
    if (record.entries.some((entry) => locked(entry.path))) continue
    record.state = await observeCommit(app, record)
    record.settledBy = 'recovery'
    await store.save(record)
    settled.push(record)
  }
  return settled
}
