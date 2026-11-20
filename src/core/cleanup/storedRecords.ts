import { VERBEX_DIR } from '../../constants'
import {
  CHAT_DIR,
  JSON_DB_ROOT,
  LEGACY_JSON_DB_ROOT,
} from '../../database/json/constants'

/**
 * Bulk removal of the records Verbex piles up while it is used: chats, run
 * records, rollback points, large-document job journals and backups. Skills,
 * prompts, workflows, settings, search indexes and evaluation labels are not
 * records of use and are never listed here.
 */

export type CleanupAdapter = {
  exists(path: string): Promise<boolean>
  list(path: string): Promise<{ files: string[]; folders: string[] }>
  stat(path: string): Promise<{ mtime: number; size: number } | null>
  remove(path: string): Promise<void>
  rmdir(path: string, recursive: boolean): Promise<void>
}

export const CLEANUP_TARGETS = [
  'chats',
  'runs',
  'checkpoints',
  'jobs',
  'backups',
] as const
export type CleanupTarget = (typeof CLEANUP_TARGETS)[number]

/** Why an item is listed but never deleted. */
export type CleanupKeepReason = 'open' | 'recent' | 'pending'

export type CleanupItem = {
  target: CleanupTarget
  /** The record: a file, or a folder removed as a whole. */
  path: string
  folder: boolean
  /**
   * What is removed. For a file record this also holds the `.tmp`/`.bak`
   * copies a save leaves beside it.
   */
  paths: string[]
  /** Newest change among the files of the item. */
  mtime: number
  bytes: number
  files: number
  conversationId?: string
  keep?: CleanupKeepReason
}

/** Everything, or only items untouched for this many days. */
export type CleanupScope = 'all' | number

export type CleanupScanOptions = {
  now: number
  /** Conversations that are open or have work in progress. */
  openConversationIds?: readonly string[]
  /** Runs in progress, and runs whose rollback point is not settled. */
  keepRunIds?: readonly string[]
  /** The rollback points could not be read reliably: keep all of them. */
  keepAllProviderCheckpoints?: boolean
}

/** Anything changed this recently may belong to work that is still going on. */
export const CLEANUP_RECENT_MS = 60 * 60 * 1000

const CHATS = `${JSON_DB_ROOT}/${CHAT_DIR}`
const RUNS = `${VERBEX_DIR}/Runs`
const CHECKPOINT_ROOTS = [
  `${VERBEX_DIR}/checkpoints`,
  `${VERBEX_DIR}/provider-checkpoints`,
  `${VERBEX_DIR}/binary-checkpoints`,
]
const PROVIDER_CHECKPOINTS = CHECKPOINT_ROOTS[1]
const JOBS = `${VERBEX_DIR}/Batch`
const JOB_LEASES = 'leases'
const INDEX = `${VERBEX_DIR}/index`
const BACKUPS = `${VERBEX_DIR}/backups`
const INDEX_BACKUP_SUFFIX = '.backup.gz'
/** Old chat storage set aside when it was merged into the current one. */
const LEGACY_CHAT_BACKUP_PREFIX = `${LEGACY_JSON_DB_ROOT}.bak-`
const RECORD_ROOTS = [CHATS, RUNS, ...CHECKPOINT_ROOTS, JOBS, BACKUPS]
const SIBLING = /\.(?:tmp|bak)$/

const clean = (path: string) => path.replace(/\/+$/, '')
const name = (path: string) => clean(path).split('/').pop() ?? ''

/** True only for the paths a scan can produce. */
function isRecordPath(path: string, folder: boolean): boolean {
  if (path !== clean(path) || path.split('/').includes('..')) return false
  for (const root of RECORD_ROOTS) {
    if (!path.startsWith(`${root}/`)) continue
    const rest = path.slice(root.length + 1)
    return !!rest && !rest.includes('/') && rest !== JOB_LEASES
  }
  if (path.startsWith(`${INDEX}/`))
    return (
      !folder &&
      !path.slice(INDEX.length + 1).includes('/') &&
      path.endsWith(INDEX_BACKUP_SUFFIX)
    )
  return (
    folder && !path.includes('/') && path.startsWith(LEGACY_CHAT_BACKUP_PREFIX)
  )
}

async function listDir(adapter: CleanupAdapter, dir: string) {
  if (dir && !(await adapter.exists(dir))) return { files: [], folders: [] }
  const listed = await adapter.list(dir || '/')
  return {
    files: listed.files.map(clean),
    folders: listed.folders.map(clean),
  }
}

type Measure = Pick<CleanupItem, 'mtime' | 'bytes' | 'files'>

async function measure(
  adapter: CleanupAdapter,
  path: string,
  folder: boolean,
): Promise<Measure> {
  if (!folder) {
    const stat = await adapter.stat(path)
    return stat
      ? { mtime: stat.mtime, bytes: stat.size, files: 1 }
      : { mtime: 0, bytes: 0, files: 0 }
  }
  const total = { mtime: 0, bytes: 0, files: 0 }
  const listed = await listDir(adapter, path)
  for (const child of [
    ...listed.files.map((file) => ({ path: file, folder: false })),
    ...listed.folders.map((dir) => ({ path: dir, folder: true })),
  ]) {
    const part = await measure(adapter, child.path, child.folder)
    total.mtime = Math.max(total.mtime, part.mtime)
    total.bytes += part.bytes
    total.files += part.files
  }
  return total
}

async function measureAll(
  adapter: CleanupAdapter,
  paths: readonly string[],
  folder: boolean,
): Promise<Measure> {
  const total = { mtime: 0, bytes: 0, files: 0 }
  for (const path of paths) {
    const part = await measure(adapter, path, folder)
    total.mtime = Math.max(total.mtime, part.mtime)
    total.bytes += part.bytes
    total.files += part.files
  }
  return total
}

/**
 * An item with no dated file (an empty folder, a file that vanished) has an
 * unknown age, so it counts as in use rather than as infinitely old.
 */
const isRecent = (measured: Measure, now: number) =>
  measured.files === 0 || now - measured.mtime < CLEANUP_RECENT_MS

/** Record files with the save copies (`x.json.bak`) folded into `x.json`. */
function groupSiblings(files: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const file of files) {
    const record = file.replace(SIBLING, '')
    groups.set(record, [...(groups.get(record) ?? []), file])
  }
  return groups
}

export async function scanStoredRecords(
  adapter: CleanupAdapter,
  options: CleanupScanOptions,
): Promise<CleanupItem[]> {
  const open = new Set(options.openConversationIds ?? [])
  const keepRuns = new Set(options.keepRunIds ?? [])
  const items: CleanupItem[] = []
  const add = async (
    target: CleanupTarget,
    path: string,
    folder: boolean,
    extra: { paths?: string[]; runId?: string; keep?: CleanupKeepReason } = {},
  ) => {
    const paths = extra.paths ?? [path]
    const measured = await measureAll(adapter, paths, folder)
    // A run started from a chat is named after the conversation.
    const conversationId =
      target === 'chats'
        ? /^v\d+_(.+)\.json$/.exec(name(path))?.[1]
        : extra.runId?.startsWith('chat-')
          ? extra.runId.slice(5)
          : undefined
    const keep =
      extra.keep ??
      (conversationId && open.has(conversationId)
        ? 'open'
        : extra.runId && keepRuns.has(extra.runId)
          ? 'pending'
          : isRecent(measured, options.now)
            ? 'recent'
            : undefined)
    items.push({
      target,
      path,
      folder,
      paths,
      ...measured,
      conversationId,
      keep,
    })
  }

  for (const [record, paths] of groupSiblings(
    (await listDir(adapter, CHATS)).files,
  ))
    await add('chats', record, false, { paths })

  for (const [record, paths] of groupSiblings(
    (await listDir(adapter, RUNS)).files,
  ))
    await add('runs', record, false, {
      paths,
      runId: name(record).replace(/\.json$/, ''),
    })

  for (const root of CHECKPOINT_ROOTS) {
    const listed = await listDir(adapter, root)
    const keepAll =
      root === PROVIDER_CHECKPOINTS && options.keepAllProviderCheckpoints
    for (const file of listed.files) await add('checkpoints', file, false)
    for (const dir of listed.folders)
      await add('checkpoints', dir, true, {
        runId: name(dir),
        keep: keepAll ? 'pending' : undefined,
      })
  }

  const jobs = await listDir(adapter, JOBS)
  for (const file of jobs.files) await add('jobs', file, false)
  for (const dir of jobs.folders)
    if (name(dir) !== JOB_LEASES) await add('jobs', dir, true)

  for (const file of (await listDir(adapter, INDEX)).files)
    if (file.endsWith(INDEX_BACKUP_SUFFIX)) await add('backups', file, false)
  const backups = await listDir(adapter, BACKUPS)
  for (const file of backups.files) await add('backups', file, false)
  for (const dir of backups.folders) await add('backups', dir, true)
  for (const dir of (await listDir(adapter, '')).folders)
    if (dir.startsWith(LEGACY_CHAT_BACKUP_PREFIX))
      await add('backups', dir, true)

  return items
}

export function selectForCleanup(
  items: readonly CleanupItem[],
  target: CleanupTarget,
  scope: CleanupScope,
  now: number,
): CleanupItem[] {
  const before = scope === 'all' ? Infinity : now - scope * 24 * 60 * 60 * 1000
  return items.filter(
    (item) => item.target === target && !item.keep && item.mtime < before,
  )
}

export type CleanupResult = {
  deleted: CleanupItem[]
  /** Changed after it was listed, so it was left alone. */
  skipped: CleanupItem[]
  failed: { path: string; error: string }[]
}

/**
 * Deletes the given items. Each one is measured again first: an item that
 * changed since it was listed belongs to work in progress and is skipped.
 */
export async function deleteStoredRecords(
  adapter: CleanupAdapter,
  items: readonly CleanupItem[],
): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: [], skipped: [], failed: [] }
  for (const item of items) {
    try {
      // Nothing outside the record folders is ever removed, whatever the
      // caller passes in.
      if (
        item.keep ||
        !isRecordPath(item.path, item.folder) ||
        item.paths.some(
          (path) =>
            path !== item.path &&
            (item.folder || path.replace(SIBLING, '') !== item.path),
        )
      )
        throw new Error('not a stored record')
      const current = await measureAll(adapter, item.paths, item.folder)
      if (current.mtime !== item.mtime || current.files !== item.files) {
        result.skipped.push(item)
        continue
      }
      for (const path of item.paths) {
        if (item.folder) await adapter.rmdir(path, true)
        else await adapter.remove(path)
      }
      result.deleted.push(item)
    } catch (error) {
      result.failed.push({
        path: item.path,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}

export function summarize(items: readonly CleanupItem[]) {
  return {
    count: items.length,
    bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  }
}
