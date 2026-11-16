import { type App, type TFile, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { coerceString } from '../../utils/coerceString'

import { splitBlocks } from './noteBlocks'
import { sanitizeNoteTitle } from './noteTitle'
import * as tidyScanText from './tidyScanText'
import { type Frontmatter, readFrontmatter } from './tidyVault'

const MAX_SCAN_NOTES = 400
/** Blocks shorter than this ("- 예", "---") say nothing about similarity. */
const MIN_SHARED_BLOCK_LENGTH = 20
const TASK_TYPES = new Set([
  'task',
  'idea',
  'plan',
  'decision',
  '과제',
  '아이디어',
  '계획',
  '결정',
])

export type TidyScanInput = {
  folder?: string
  paths?: string[]
  limit?: number
}

function scopeFiles(app: App, input: TidyScanInput): TFile[] {
  const files = app.vault.getMarkdownFiles()
  if (input.paths?.length) {
    const wanted = new Set(input.paths.map((path) => normalizePath(path)))
    return files.filter((file) => wanted.has(file.path))
  }
  const folder = normalizePath(input.folder ?? '').replace(/\/$/, '')
  return files.filter((file) => !folder || file.path.startsWith(`${folder}/`))
}

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[\s\-_·.,()[\]]+/)
      .filter((token) => token.length >= 2),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared += 1
  return shared / (a.size + b.size - shared)
}

const round = (value: number) => Math.round(value * 100) / 100

/** Facts only; deciding what to merge, link or split is the model's job. */
export async function tidyScan(
  app: App,
  input: TidyScanInput,
): Promise<string> {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 20)))
  const all = scopeFiles(app, input).sort((a, b) =>
    a.path.localeCompare(b.path),
  )
  const files = all.slice(0, MAX_SCAN_NOTES)
  const blockCount = new Map<string, number>()
  const owners = new Map<string, Set<string>>()
  const properties = new Map<string, Frontmatter>()
  for (const file of files) {
    const content = await app.vault.cachedRead(file)
    properties.set(file.path, readFrontmatter(content))
    const blocks = splitBlocks(content).filter(
      (block) =>
        block.kind !== 'heading' &&
        block.norm.length >= MIN_SHARED_BLOCK_LENGTH,
    )
    blockCount.set(file.path, blocks.length)
    for (const block of blocks) {
      const set = owners.get(block.norm) ?? new Set<string>()
      set.add(file.path)
      owners.set(block.norm, set)
    }
  }
  const shared = new Map<string, number>()
  for (const paths of owners.values()) {
    if (paths.size < 2 || paths.size > 8) continue
    const list = [...paths].sort()
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1) {
        const key = `${list[i]}\u0000${list[j]}`
        shared.set(key, (shared.get(key) ?? 0) + 1)
      }
  }
  const resolved = app.metadataCache.resolvedLinks
  const links = (path: string) => new Set(Object.keys(resolved[path] ?? {}))
  const tokens = new Map(
    files.map((file) => [file.path, titleTokens(file.basename)]),
  )
  for (let i = 0; i < files.length; i += 1)
    for (let j = i + 1; j < files.length; j += 1) {
      const a = files[i].path
      const b = files[j].path
      const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
      if (
        !shared.has(key) &&
        jaccard(tokens.get(a) ?? new Set(), tokens.get(b) ?? new Set()) >= 0.5
      )
        shared.set(key, 0)
    }
  const pairs = [...shared.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('\u0000')
      const smaller = Math.min(blockCount.get(a) ?? 0, blockCount.get(b) ?? 0)
      return {
        a,
        b,
        sharedBlocks: count,
        sharedRatio: smaller ? round(count / smaller) : 0,
        titleOverlap: round(
          jaccard(tokens.get(a) ?? new Set(), tokens.get(b) ?? new Set()),
        ),
        sharedLinks: round(jaccard(links(a), links(b))),
      }
    })
    .sort(
      (x, y) =>
        y.sharedRatio - x.sharedRatio || y.titleOverlap - x.titleOverlap,
    )
  const scope = new Set(files.map((file) => file.path))
  const unresolved = new Map<string, number>()
  const unresolvedLinks = app.metadataCache.unresolvedLinks
  for (const [source, targets] of Object.entries(unresolvedLinks ?? {})) {
    if (!scope.has(source)) continue
    for (const name of Object.keys(targets))
      unresolved.set(name, (unresolved.get(name) ?? 0) + 1)
  }
  const untyped = files.filter((file) => !properties.get(file.path)?.type)
  const invalid = files.flatMap((file) => {
    const result = sanitizeNoteTitle(file.basename)
    return result.ok && result.changed
      ? [`${file.path} → "${result.title}" (${result.reasons.join(', ')})`]
      : []
  })
  const tasks = files.filter((file) =>
    TASK_TYPES.has(
      coerceString(properties.get(file.path)?.type ?? '').toLowerCase(),
    ),
  )
  const lines = [
    L({
      ko: `[정리 후보 사실] 범위 노트 ${all.length}개${all.length > files.length ? ` 중 앞의 ${files.length}개만 검사(잘림)` : ''}. 판단은 하지 않았습니다.`,
      en: `[Tidy candidate facts] ${all.length} notes in scope${all.length > files.length ? tidyScanText.scanTruncated(files.length) : ''}. No judgments were made.`,
    }),
    '',
    L({
      ko: `## 비슷한 노트 쌍 (${pairs.length}개${pairs.length > limit ? `, 앞 ${limit}개 표시` : ''})`,
      en: `## Similar note pairs (${pairs.length}${pairs.length > limit ? tidyScanText.displayLimit(limit) : ''})`,
    }),
    tidyScanText.pairExplanation(),
    ...pairs
      .slice(0, limit)
      .map((pair) =>
        tidyScanText.pair(
          pair.a,
          pair.b,
          pair.sharedBlocks,
          pair.sharedRatio,
          pair.titleOverlap,
          pair.sharedLinks,
        ),
      ),
    '',
    tidyScanText.missingLinksHeading(unresolved.size),
    ...[...unresolved.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => tidyScanText.missingLink(name, count)),
    '',
    tidyScanText.untypedHeading(untyped.length),
    ...untyped.slice(0, limit).map((file) => `- ${file.path}`),
    '',
    tidyScanText.unsafeHeading(invalid.length),
    ...invalid.slice(0, limit).map((line) => `- ${line}`),
    '',
    tidyScanText.tasksHeading(tasks.length),
    ...tasks.slice(0, limit).map((file) => {
      const data = properties.get(file.path) ?? {}
      const modified = new Date(file.stat.mtime).toISOString().slice(0, 10)
      return L({
        ko: `- ${file.path}: type=${String(data.type)}, status=${coerceString(data.status ?? '(없음)')}, 수정 ${modified}`,
        en: `- ${file.path}: type=${String(data.type)}, status=${coerceString(data.status ?? tidyScanText.none())}, modified ${modified}`,
      })
    }),
  ]
  return lines.join('\n')
}
