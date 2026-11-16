import { App, normalizePath } from 'obsidian'

import { VERBEX_DIR } from '../constants'
import { sha256HexBytes } from '../utils/hash'
import { ensureVaultDir, nowIso } from '../verbex/vault'

export type BinaryCheckpointInput = {
  contentKind: 'binary'
  path: string
  before: Uint8Array
  mediaType?: string
}

export type BinaryCheckpointEntry = {
  contentKind: 'binary'
  path: string
  beforeHash: string
  beforeSizeBytes: number
  mediaType?: string
  snapshotRef: string
  /** SHA-256 the host read back after its write. Absent on records made before run rollback covered binary files. */
  afterHash?: string
}

export type BinaryCheckpointRecord = {
  contentKind: 'binary'
  id: string
  runId: string
  createdAt: string
  entries: BinaryCheckpointEntry[]
  sizeBytes: number
  restoredAt?: string
}

/** Durable binary snapshots kept separate from the text checkpoint manifest. */
export class BinaryCheckpointManager {
  constructor(private readonly app: App) {}

  private get root(): string {
    return `${VERBEX_DIR}/binary-checkpoints`
  }

  private checkpointDir(runId: string, checkpointId: string): string {
    return `${this.root}/${runId}/${checkpointId}`
  }

  async create(
    runId: string,
    input: BinaryCheckpointInput,
  ): Promise<BinaryCheckpointRecord> {
    const data = new Uint8Array(input.before)
    const { path, mediaType } = input
    const checkpointId = `bcp-${nowIso().replace(/[:.]/g, '-')}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const dir = this.checkpointDir(runId, checkpointId)
    await ensureVaultDir(this.app, `${dir}/files`)
    const snapshotRef = 'files/0.snap'
    const snapshotPath = normalizePath(`${dir}/${snapshotRef}`)
    await this.app.vault.adapter.writeBinary(snapshotPath, toArrayBuffer(data))
    const beforeHash = await sha256HexBytes(data)
    const saved = await this.app.vault.adapter.readBinary(snapshotPath)
    if (
      saved.byteLength !== data.byteLength ||
      (await sha256HexBytes(saved)) !== beforeHash
    )
      throw new Error('Binary checkpoint snapshot verification failed.')
    const entry: BinaryCheckpointEntry = {
      contentKind: 'binary',
      path,
      beforeHash,
      beforeSizeBytes: data.byteLength,
      ...(mediaType ? { mediaType } : {}),
      snapshotRef,
    }
    const record: BinaryCheckpointRecord = {
      contentKind: 'binary',
      id: checkpointId,
      runId,
      createdAt: nowIso(),
      entries: [entry],
      sizeBytes: data.byteLength,
    }
    const manifestPath = normalizePath(`${dir}/manifest.json`)
    const manifest = JSON.stringify(record, null, 2)
    await this.app.vault.adapter.write(manifestPath, manifest)
    if ((await this.app.vault.adapter.read(manifestPath)) !== manifest)
      throw new Error('Binary checkpoint manifest verification failed.')
    return record
  }

  /** Records what the host wrote, so a later rollback can tell its own write from a newer one. */
  async recordAfter(
    runId: string,
    checkpointId: string,
    path: string,
    afterHash: string,
  ): Promise<void> {
    const record = await this.read(runId, checkpointId)
    const entries = record?.entries.filter((item) => item.path === path) ?? []
    if (
      !record ||
      record.runId !== runId ||
      record.id !== checkpointId ||
      entries.length !== 1
    )
      throw new Error('Binary checkpoint record is missing or inconsistent.')
    entries[0].afterHash = afterHash
    await this.save(record)
    const saved = await this.read(runId, checkpointId)
    if (JSON.stringify(saved) !== JSON.stringify(record))
      throw new Error('Binary checkpoint result verification failed.')
  }

  async markRestored(record: BinaryCheckpointRecord): Promise<void> {
    await this.save({ ...record, restoredAt: nowIso() })
  }

  private async save(record: BinaryCheckpointRecord): Promise<void> {
    await this.app.vault.adapter.write(
      normalizePath(
        `${this.checkpointDir(record.runId, record.id)}/manifest.json`,
      ),
      JSON.stringify(record, null, 2),
    )
  }

  /** Records of one run, newest first. */
  async list(runId: string): Promise<BinaryCheckpointRecord[]> {
    const dir = normalizePath(`${this.root}/${runId}`)
    if (!(await this.app.vault.adapter.exists(dir))) return []
    const records: BinaryCheckpointRecord[] = []
    for (const folder of (await this.app.vault.adapter.list(dir)).folders) {
      const id = folder.split('/').filter(Boolean).pop() ?? ''
      const record = await this.read(runId, id)
      if (record) records.push(record)
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async restore(runId: string, checkpointId: string): Promise<void> {
    const record = await this.read(runId, checkpointId)
    if (!record) throw new Error(`Binary checkpoint ${checkpointId} not found`)
    for (const entry of record.entries) {
      const path = normalizePath(
        `${this.checkpointDir(runId, checkpointId)}/${entry.snapshotRef}`,
      )
      if (!(await this.app.vault.adapter.exists(path))) {
        throw new Error(
          `Binary checkpoint snapshot is missing: ${entry.snapshotRef}`,
        )
      }
      const bytes = new Uint8Array(
        await this.app.vault.adapter.readBinary(path),
      )
      const hash = await sha256HexBytes(bytes)
      if (hash !== entry.beforeHash) {
        throw new Error(
          `Binary checkpoint snapshot hash mismatch: ${entry.path}`,
        )
      }
      const file = this.app.vault.getAbstractFileByPath(entry.path)
      if (!isVaultFile(file)) {
        throw new Error(`Binary checkpoint target is missing: ${entry.path}`)
      }
      await this.app.vault.modifyBinary(
        file as Parameters<typeof this.app.vault.modifyBinary>[0],
        toArrayBuffer(bytes),
      )
    }
  }

  async read(
    runId: string,
    checkpointId: string,
  ): Promise<BinaryCheckpointRecord | null> {
    const path = normalizePath(
      `${this.checkpointDir(runId, checkpointId)}/manifest.json`,
    )
    if (!(await this.app.vault.adapter.exists(path))) return null
    try {
      const record = JSON.parse(await this.app.vault.adapter.read(path)) as
        | BinaryCheckpointRecord
        | undefined
      return record?.contentKind === 'binary' ? record : null
    } catch {
      return null
    }
  }
}

function isVaultFile(value: unknown): value is { path: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { path?: unknown }).path === 'string',
  )
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer
}
