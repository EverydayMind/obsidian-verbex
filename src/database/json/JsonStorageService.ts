import { App, DataAdapter, normalizePath } from 'obsidian'
import path from 'path-browserify'

import { logStartupDiagnostic } from '../../utils/startupDiagnostics'

import { ChatManager } from './chat/ChatManager'
import { JSON_DB_ROOT, LEGACY_JSON_DB_ROOT } from './constants'
import { TemplateManager } from './template/TemplateManager'

export class JsonStorageService {
  readonly chatManager: ChatManager
  readonly templateManager: TemplateManager

  private constructor(
    app: App,
    readonly root: string,
  ) {
    this.chatManager = new ChatManager(app, root)
    this.templateManager = new TemplateManager(app, root)
  }

  static async create(app: App): Promise<JsonStorageService> {
    const root = await resolveJsonDbRoot(app.vault.adapter)
    const service = new JsonStorageService(app, root)
    // Directory preparation only; the DB/RAG stores are not opened here.
    await Promise.all([
      service.chatManager.ready(),
      service.templateManager.ready(),
    ])
    return service
  }
}

export async function resolveJsonDbRoot(adapter: DataAdapter): Promise<string> {
  const [hasCurrent, hasLegacy] = await Promise.all([
    adapter.exists(JSON_DB_ROOT),
    adapter.exists(LEGACY_JSON_DB_ROOT),
  ])
  logStartupDiagnostic({
    event: 'json-storage:roots',
    hasCurrent,
    hasLegacy,
  })
  if (hasCurrent && !hasLegacy) return JSON_DB_ROOT
  if (!hasCurrent && hasLegacy) {
    try {
      await adapter.rename(LEGACY_JSON_DB_ROOT, JSON_DB_ROOT)
      return JSON_DB_ROOT
    } catch (error) {
      console.error(
        'Failed to rename legacy JSON storage; using it in place',
        error,
      )
      return LEGACY_JSON_DB_ROOT
    }
  }
  if (!hasCurrent && !hasLegacy) return JSON_DB_ROOT

  try {
    const legacyFiles = await listFilesRecursively(adapter, LEGACY_JSON_DB_ROOT)
    for (const legacyFile of legacyFiles) {
      const relative = legacyFile.slice(LEGACY_JSON_DB_ROOT.length + 1)
      const target = normalizePath(path.join(JSON_DB_ROOT, relative))
      if (await adapter.exists(target)) continue
      await ensureParentDirectories(adapter, target)
      const content = await adapter.readBinary(legacyFile)
      await adapter.writeBinary(target, content)
      const copied = await adapter.readBinary(target)
      if (!binaryEquals(content, copied)) {
        throw new Error(`JSON storage copy verification failed: ${relative}`)
      }
    }
    const backup = await uniqueBackupPath(adapter, new Date())
    await adapter.rename(LEGACY_JSON_DB_ROOT, backup)
  } catch (error) {
    console.error(
      'Failed to merge legacy JSON storage; preserving both roots',
      error,
    )
  }
  return JSON_DB_ROOT
}

export async function uniqueBackupPath(
  adapter: Pick<DataAdapter, 'exists'>,
  now: Date,
): Promise<string> {
  const timestamp = [
    now.getFullYear().toString().padStart(4, '0'),
    (now.getMonth() + 1).toString().padStart(2, '0'),
    now.getDate().toString().padStart(2, '0'),
    '-',
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join('')
  const base = `${LEGACY_JSON_DB_ROOT}.bak-${timestamp}`
  let candidate = base
  let suffix = 2
  while (await adapter.exists(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

async function listFilesRecursively(
  adapter: DataAdapter,
  root: string,
): Promise<string[]> {
  const listed = await adapter.list(root)
  const nested = await Promise.all(
    listed.folders.map((folder) => listFilesRecursively(adapter, folder)),
  )
  return [...listed.files, ...nested.flat()]
}

async function ensureParentDirectories(
  adapter: DataAdapter,
  filePath: string,
): Promise<void> {
  const parent = path.dirname(filePath)
  if (!parent || parent === '.') return
  const segments = normalizePath(parent).split('/')
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    if (!(await adapter.exists(current))) await adapter.mkdir(current)
  }
}

function binaryEquals(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  return a.every((value, index) => value === b[index])
}
