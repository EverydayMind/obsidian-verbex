import { App, normalizePath } from 'obsidian'
import path from 'path-browserify'

import {
  JsonRecordError,
  MAX_RECORD_DIAGNOSTICS,
  RecordDiagnostic,
  isEnoent,
  isPlainObject,
  parseJsonObject,
} from './recordCodec'
import {
  isRecoverySibling,
  writeJsonRecoverable,
} from './recoverableJsonWriter'

export abstract class AbstractJsonRepository<T, M> {
  protected dataDir: string
  protected app: App

  // Created on the first ready() call, never in the constructor, so an unused
  // repository cannot produce an unhandled rejection.
  private readyPromise: Promise<void> | null = null
  private listDiagnostics: RecordDiagnostic[] = []

  constructor(app: App, dataDir: string) {
    this.app = app
    this.dataDir = normalizePath(dataDir)
  }

  /**
   * Resolves once the data directory (and its parents) exist. A failure is
   * remembered: every later call on this instance rejects the same way. Retry
   * by creating a new instance.
   */
  public ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.ensureDirectory()
    return this.readyPromise
  }

  private async ensureDirectory(): Promise<void> {
    const adapter = this.app.vault.adapter
    let current = ''
    for (const segment of this.dataDir.split('/').filter(Boolean)) {
      current = current ? `${current}/${segment}` : segment
      if (await adapter.exists(current)) continue
      try {
        await adapter.mkdir(current)
      } catch (error) {
        // A concurrent creator may win the race; anything else (permissions,
        // disk) must surface.
        if (!(await adapter.exists(current))) throw error
      }
    }
  }

  // Each subclass implements how to generate a file name from a data row.
  protected abstract generateFileName(row: T): string

  // Each subclass implements how to parse a file name into metadata.
  protected abstract parseFileName(fileName: string): M | null

  /**
   * Validates a parsed record. Throw JsonRecordError('invalid' | 'unsupported')
   * for records that must not be used. The default only requires an object.
   */
  protected validateRecord(value: unknown, fileName: string): T {
    if (!isPlainObject(value)) throw new JsonRecordError('invalid', fileName)
    return value as T
  }

  /** Bounded, content-free diagnostics from the most recent isolated listing. */
  public getListDiagnostics(): readonly RecordDiagnostic[] {
    return this.listDiagnostics
  }

  public async create(row: T): Promise<void> {
    await this.ready()
    const fileName = this.generateFileName(row)
    const filePath = normalizePath(path.join(this.dataDir, fileName))
    const content = JSON.stringify(row, null, 2)

    if (await this.app.vault.adapter.exists(filePath)) {
      throw new Error(`File already exists: ${filePath}`)
    }

    await this.writeRecord(fileName, content)
  }

  /**
   * Writes serialized, already-redacted record text through the recoverable
   * writer (verified temp + backup, then replace + readback).
   */
  protected async writeRecord(
    fileName: string,
    content: string,
  ): Promise<void> {
    const filePath = normalizePath(path.join(this.dataDir, fileName))
    await writeJsonRecoverable(
      this.app.vault.adapter,
      filePath,
      content,
      (text) => this.validateRecord(parseJsonObject(text, fileName), fileName),
    )
  }

  /**
   * Canonical records that are missing or unreadable while a verified `.tmp`
   * or `.bak` sibling exists. Reported only; nothing is promoted or restored
   * automatically (a valid older copy is not proof of the latest state).
   */
  public async findRecoveryCandidates(): Promise<
    { fileName: string; candidates: string[] }[]
  > {
    await this.ready()
    const listed = await this.app.vault.adapter.list(this.dataDir)
    const byRecord = new Map<string, string[]>()
    for (const filePath of listed.files) {
      const name = path.basename(filePath)
      if (!isRecoverySibling(name)) continue
      const record = name.slice(0, name.lastIndexOf('.'))
      byRecord.set(record, [...(byRecord.get(record) ?? []), name])
    }
    const result: { fileName: string; candidates: string[] }[] = []
    for (const [fileName, candidates] of byRecord) {
      let healthy = false
      try {
        healthy = (await this.read(fileName)) !== null
      } catch {
        healthy = false
      }
      if (!healthy) result.push({ fileName, candidates })
    }
    return result
  }

  public async update(oldRow: T, newRow: T): Promise<void> {
    await this.ready()
    const oldFileName = this.generateFileName(oldRow)
    const newFileName = this.generateFileName(newRow)
    const content = JSON.stringify(newRow, null, 2)

    if (oldFileName === newFileName) {
      // Simple update - filename hasn't changed
      await this.writeRecord(oldFileName, content)
    } else {
      // Filename has changed - create new file and delete old one
      await this.writeRecord(newFileName, content)
      await this.delete(oldFileName)
    }
  }

  // List metadata for all records by parsing file names.
  public async listMetadata(): Promise<(M & { fileName: string })[]> {
    await this.ready()
    const files = await this.app.vault.adapter.list(this.dataDir)
    return files.files
      .map((filePath) => path.basename(filePath))
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => {
        const metadata = this.parseFileName(fileName)
        return metadata ? { ...metadata, fileName } : null
      })
      .filter(
        (metadata): metadata is M & { fileName: string } => metadata !== null,
      )
  }

  /**
   * Reads one record. Returns null only when the file does not exist. A file
   * that is corrupt or from a newer schema throws JsonRecordError so callers
   * (notably create-on-null paths) never overwrite it by mistake.
   */
  public async read(fileName: string): Promise<T | null> {
    await this.ready()
    return this.readRecord(fileName)
  }

  /** Read without directory creation or repository initialization. */
  public async readOnly(fileName: string): Promise<T | null> {
    return this.readRecord(fileName)
  }

  private async readRecord(fileName: string): Promise<T | null> {
    const filePath = normalizePath(path.join(this.dataDir, fileName))
    if (!(await this.app.vault.adapter.exists(filePath))) return null

    let content: string
    try {
      content = await this.app.vault.adapter.read(filePath)
    } catch (error) {
      // Removed between exists() and read() by a concurrent delete.
      if (isEnoent(error)) return null
      throw new JsonRecordError('io', fileName)
    }
    return this.validateRecord(parseJsonObject(content, fileName), fileName)
  }

  /**
   * Reads many records, isolating per-file failures: healthy records are
   * returned, each unreadable file is recorded in getListDiagnostics().
   */
  protected async readIsolated(
    fileNames: string[],
    read: (fileName: string) => Promise<T | null> = (fileName) =>
      this.read(fileName),
  ): Promise<{ fileName: string; record: T }[]> {
    const diagnostics: RecordDiagnostic[] = []
    let omitted = 0
    const results = await Promise.all(
      fileNames.map(
        async (fileName): Promise<{ fileName: string; record: T } | null> => {
          try {
            const record = await read(fileName)
            return record ? { fileName, record } : null
          } catch (error) {
            const kind =
              error instanceof JsonRecordError ? error.kind : ('io' as const)
            if (diagnostics.length < MAX_RECORD_DIAGNOSTICS) {
              diagnostics.push({ fileName, kind })
            } else {
              omitted += 1
            }
            return null
          }
        },
      ),
    )
    this.listDiagnostics = diagnostics
    if (diagnostics.length > 0) {
      console.warn(
        `Skipped ${diagnostics.length + omitted} unreadable record(s) in ${this.dataDir}`,
        diagnostics.map((d) => `${d.fileName} (${d.kind})`),
      )
    }
    return results.filter(
      (item): item is { fileName: string; record: T } => item !== null,
    )
  }

  public async delete(fileName: string): Promise<void> {
    await this.ready()
    const filePath = normalizePath(path.join(this.dataDir, fileName))
    try {
      await this.app.vault.adapter.remove(filePath)
    } catch (error) {
      // ENOENT means the file was already removed (e.g. by a concurrent call) — not an error.
      if (!isEnoent(error)) {
        throw error
      }
    }
  }
}
