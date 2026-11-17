import { App, normalizePath } from 'obsidian'

import { VERBEX_DIR } from '../constants'
import { sha256HexBytes } from '../utils/hash'
import { ensureVaultDir, nowIso } from '../verbex/vault'

import { toArrayBuffer } from './BinaryCheckpointManager'
import { readManifest, saveManifest } from './providerCheckpointManifests'
import { scanManifests } from './providerCheckpointScan'

export type ProviderCheckpointItemState =
  | 'pending'
  | 'written'
  | 'unchanged'
  | 'not_written'
  | 'unknown'
export type ProviderCheckpointState =
  | 'pending'
  | 'written'
  | 'not_written'
  | 'partial'
  | 'unknown'

export type ProviderCheckpointFile = {
  kind: 'file'
  path: string
  role: 'primary' | 'derived'
  existedBefore: boolean
  /** Null when the file did not exist. */
  beforeHash: string | null
  snapshotRef: string | null
  expectedHash: string
  /** Set only after the host read the file back. */
  afterHash?: string
  state: ProviderCheckpointItemState
  restore?: 'restored' | 'skipped' | 'failed'
}
export type ProviderCheckpointFolder = {
  kind: 'folder'
  path: string
  state: ProviderCheckpointItemState
  restore?: 'restored' | 'skipped' | 'failed'
}
export type ProviderCheckpointEntry =
  | ProviderCheckpointFile
  | ProviderCheckpointFolder

/** One provider commit: what was on disk before, what was approved, what was read back. */
export type ProviderCheckpointRecord = {
  schemaVersion: 1
  /** Monotonic manifest revision; legacy records omit it. */
  revision?: number
  contentKind: 'provider-commit'
  id: string
  runId: string
  createdAt: string
  providerId: string
  /** The conversation that approved this write; used by human status queries. */
  conversationId?: string
  tool: string
  mode: 'overwrite' | 'save_as' | 'create'
  destination: string
  preparationId: string
  preparationDigest: string
  ticketId: string
  state: ProviderCheckpointState
  entries: ProviderCheckpointEntry[]
  sizeBytes: number
  /** How the state was last established: the commit itself or a later disk comparison. */
  settledBy?: 'commit' | 'recovery'
  /** Observed anomalies, not evidence that this provider caused a Vault event. */
  unexpectedChanges?: {
    count: number
    paths: { path: string; source: 'event' | 'receipt' | 'readback' }[]
    truncated: boolean
  }
}

export type ProviderCheckpointInput = Pick<
  ProviderCheckpointRecord,
  | 'providerId'
  | 'conversationId'
  | 'tool'
  | 'mode'
  | 'destination'
  | 'preparationId'
  | 'preparationDigest'
  | 'ticketId'
> & {
  entries: (
    | {
        kind: 'file'
        path: string
        role: 'primary' | 'derived'
        before: Uint8Array | null
        expectedHash: string
      }
    | { kind: 'folder'; path: string }
  )[]
}

/**
 * Durable record of a provider commit under `.verbex/provider-checkpoints`.
 * The manifest is written as `pending` before the provider may write and is
 * rewritten with the read-back facts afterwards, so a restart finds what was
 * about to happen. Separate from Run State; its own schema version.
 */
export class ProviderCheckpointStore {
  constructor(private readonly app: App) {}

  private get root(): string {
    return `${VERBEX_DIR}/provider-checkpoints`
  }
  private dir(runId: string, id: string): string {
    return `${this.root}/${runId}/${id}`
  }
  private get adapter() {
    return this.app.vault.adapter
  }

  async create(
    runId: string,
    input: ProviderCheckpointInput,
  ): Promise<ProviderCheckpointRecord> {
    const id = `pcp-${nowIso().replace(/[:.]/g, '-')}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const dir = this.dir(runId, id)
    await ensureVaultDir(this.app, `${dir}/files`)
    const entries: ProviderCheckpointEntry[] = []
    let sizeBytes = 0
    for (const [index, entry] of input.entries.entries()) {
      if (entry.kind === 'folder') {
        entries.push({ kind: 'folder', path: entry.path, state: 'pending' })
        continue
      }
      let snapshotRef: string | null = null
      let beforeHash: string | null = null
      if (entry.before) {
        snapshotRef = `files/${index}.snap`
        const bytes = new Uint8Array(entry.before)
        await this.adapter.writeBinary(
          normalizePath(`${dir}/${snapshotRef}`),
          toArrayBuffer(bytes),
        )
        beforeHash = await sha256HexBytes(bytes)
        sizeBytes += bytes.byteLength
      }
      entries.push({
        kind: 'file',
        path: entry.path,
        role: entry.role,
        existedBefore: entry.before !== null,
        beforeHash,
        snapshotRef,
        expectedHash: entry.expectedHash,
        state: 'pending',
      })
    }
    const { entries: _inputs, ...identity } = input
    const record: ProviderCheckpointRecord = {
      schemaVersion: 1,
      contentKind: 'provider-commit',
      id,
      runId,
      createdAt: nowIso(),
      ...identity,
      state: 'pending',
      entries,
      sizeBytes,
    }
    await this.save(record)
    return record
  }

  async save(record: ProviderCheckpointRecord): Promise<void> {
    await saveManifest(this.app, this.dir(record.runId, record.id), record)
  }

  async read(
    runId: string,
    id: string,
  ): Promise<ProviderCheckpointRecord | null> {
    const result = await readManifest(this.app, this.dir(runId, id), runId, id)
    return result.kind === 'ok' ? result.record : null
  }

  /** Includes unreadable records and incomplete directory listings. */
  async scan(runId?: string) {
    return scanManifests(this.app, this.root, runId)
  }

  /** Snapshot bytes of one entry, verified against the recorded hash. */
  async snapshot(
    record: ProviderCheckpointRecord,
    entry: ProviderCheckpointFile,
  ): Promise<Uint8Array> {
    if (!entry.snapshotRef) throw new Error('snapshot is absent')
    const file = normalizePath(
      `${this.dir(record.runId, record.id)}/${entry.snapshotRef}`,
    )
    if (!(await this.adapter.exists(file)))
      throw new Error(`snapshot is missing: ${entry.path}`)
    const bytes = new Uint8Array(await this.adapter.readBinary(file))
    if ((await sha256HexBytes(bytes)) !== entry.beforeHash)
      throw new Error(`snapshot hash mismatch: ${entry.path}`)
    return bytes
  }

  /** All records (optionally of one run), newest first. */
  async listRunIds(): Promise<string[]> {
    const root = normalizePath(this.root)
    if (!(await this.adapter.exists(root))) return []
    return (await this.adapter.list(root)).folders.map(
      (folder) => folder.split('/').filter(Boolean).pop() ?? '',
    )
  }

  async list(runId?: string): Promise<ProviderCheckpointRecord[]> {
    const root = normalizePath(this.root)
    if (!(await this.adapter.exists(root))) return []
    const last = (folder: string) =>
      folder.split('/').filter(Boolean).pop() ?? ''
    const runIds = runId
      ? [runId]
      : (await this.adapter.list(root)).folders.map(last)
    const records: ProviderCheckpointRecord[] = []
    for (const run of runIds) {
      const dir = normalizePath(`${this.root}/${run}`)
      if (!(await this.adapter.exists(dir))) continue
      for (const folder of (await this.adapter.list(dir)).folders) {
        const record = await this.read(run, last(folder))
        if (record) records.push(record)
      }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async remove(record: ProviderCheckpointRecord): Promise<void> {
    await this.adapter.rmdir(
      normalizePath(this.dir(record.runId, record.id)),
      true,
    )
  }
}
