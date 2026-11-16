import { App, TFile } from 'obsidian'

import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

/**
 * Relationship helpers that surface Obsidian's native metadata graph to the
 * agent. Obsidian already indexes the wikilink graph (`resolvedLinks` /
 * `unresolvedLinks`), per-note structure (`getFileCache`), and tags; these pure
 * helpers expose that index in a shape the LLM tools and the system-prompt
 * orientation layer can consume.
 *
 * Backlinks are derived by inverting `resolvedLinks` rather than calling the
 * undocumented `getBacklinksForFile`, so the same code path works in the plugin
 * runtime and in unit tests with a memory vault.
 */

export type ResolvedLinks = Record<string, Record<string, number>>

export type LinkRef = { path: string; count: number }

/** Forward link counts for one source note (target path → occurrences). */
export function outgoingLinks(
  resolvedLinks: ResolvedLinks,
  sourcePath: string,
): LinkRef[] {
  const targets = resolvedLinks[sourcePath] ?? {}
  return Object.entries(targets)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/**
 * Notes that link *to* `targetPath`, derived by inverting `resolvedLinks`. This
 * is the single most useful relational signal Obsidian exposes that the agent
 * tools previously could not reach.
 */
export function backlinks(
  resolvedLinks: ResolvedLinks,
  targetPath: string,
): LinkRef[] {
  const refs: LinkRef[] = []
  for (const [source, targets] of Object.entries(resolvedLinks)) {
    const count = targets[targetPath]
    if (count) refs.push({ path: source, count })
  }
  return refs.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/** Links a note makes to notes that do not exist yet (gaps worth filling). */
export function unresolvedFor(
  unresolvedLinks: ResolvedLinks,
  sourcePath: string,
): LinkRef[] {
  const targets = unresolvedLinks[sourcePath] ?? {}
  return Object.entries(targets)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/** Strip a single leading `#` so inline (`#topic`) and YAML tags normalise alike. */
function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when every character is ASCII, so `\b` word boundaries are meaningful. */
function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) return false
  }
  return true
}

/**
 * Count textual mentions of `name` in `text`, case-insensitively. For ASCII
 * names a word-boundary match is used so "Plan" does not match "Planning"; for
 * names containing non-ASCII characters (e.g. Korean) `\b` is meaningless, so a
 * plain non-overlapping substring count is used instead. Names shorter than two
 * characters are ignored as noise. This counts *any* occurrence, including ones
 * inside a `[[wikilink]]`, so callers that want only the *unlinked* mentions
 * should exclude notes that already link to the target before counting.
 */
export function countTextMentions(text: string, name: string): number {
  const needle = name.trim()
  if (needle.length < 2) return 0
  const hay = text.toLowerCase()
  const low = needle.toLowerCase()
  if (isAscii(needle)) {
    const matches = hay.match(new RegExp(`\\b${escapeRegExp(low)}\\b`, 'g'))
    return matches ? matches.length : 0
  }
  let count = 0
  let index = hay.indexOf(low)
  while (index !== -1) {
    count += 1
    index = hay.indexOf(low, index + low.length)
  }
  return count
}

/** Total mentions of any of `names` within `text`. */
function mentionScore(text: string, names: string[]): number {
  let total = 0
  for (const name of names) total += countTextMentions(text, name)
  return total
}

/**
 * "Unlinked mentions" of a target note: candidate notes whose body mentions one
 * of the target's names (title/alias) by plain text. Pair this with
 * {@link backlinks} (the *linked* mentions) for the full set of notes that refer
 * to the target. Callers should pass `excludePaths` containing the target and
 * any note that already links to it, so only genuinely unlinked mentions remain.
 */
export function incomingUnlinkedMentions(
  targetNames: string[],
  candidates: { path: string; text: string }[],
  excludePaths: Set<string>,
): LinkRef[] {
  const refs: LinkRef[] = []
  for (const candidate of candidates) {
    if (excludePaths.has(candidate.path)) continue
    const count = mentionScore(candidate.text, targetNames)
    if (count > 0) refs.push({ path: candidate.path, count })
  }
  return refs.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/**
 * The reverse direction: notes that the target's own body mentions by name
 * without wikilinking them. `excludePaths` should contain notes the target
 * already links to (and the target itself), so only the unlinked references the
 * target makes are returned.
 */
export function outgoingUnlinkedMentions(
  targetText: string,
  candidates: { path: string; names: string[] }[],
  excludePaths: Set<string>,
): LinkRef[] {
  const refs: LinkRef[] = []
  for (const candidate of candidates) {
    if (excludePaths.has(candidate.path)) continue
    const count = mentionScore(targetText, candidate.names)
    if (count > 0) refs.push({ path: candidate.path, count })
  }
  return refs.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
}

/**
 * Tags attached to a note, merging inline `#tags` (from the metadata cache) with
 * the YAML `tags` frontmatter (string or list). Returns normalised tags without
 * the leading `#`, de-duplicated.
 */
export function noteTags(app: App, file: TFile): string[] {
  const cache = app.metadataCache?.getFileCache?.(file) ?? null
  const tags = new Set<string>()
  for (const ref of cache?.tags ?? []) {
    const tag = normalizeTag(ref.tag)
    if (tag) tags.add(tag)
  }
  const fmTags: unknown = cache?.frontmatter?.tags
  const fmList = Array.isArray(fmTags)
    ? fmTags
    : typeof fmTags === 'string'
      ? fmTags.split(/[,\s]+/)
      : []
  for (const raw of fmList) {
    const tag = normalizeTag(String(raw))
    if (tag) tags.add(tag)
  }
  return [...tags].sort()
}

/** Vault-wide tag taxonomy: tag → note paths carrying it, plus its count. */
export function collectTagIndex(app: App): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path.startsWith('.verbex')) continue
    for (const tag of noteTags(app, file)) {
      const paths = index.get(tag) ?? []
      paths.push(file.path)
      index.set(tag, paths)
    }
  }
  return index
}

export type HeadingItem = { level: number; heading: string }

/** Heading outline of a note, in document order. */
export function headingOutline(app: App, file: TFile): HeadingItem[] {
  const cache = app.metadataCache?.getFileCache?.(file) ?? null
  return (cache?.headings ?? []).map((h) => ({
    level: h.level,
    heading: h.heading,
  }))
}

/**
 * Resolved outgoing link targets taken from the metadata cache when available.
 * Falls back to `null` so callers can use a regex extractor on the raw body.
 */
export function cachedLinkTargets(app: App, file: TFile): string[] | null {
  const cache = app.metadataCache?.getFileCache?.(file)
  if (!cache) return null
  const out: string[] = []
  for (const ref of cache.links ?? []) out.push(ref.link)
  for (const ref of cache.embeds ?? []) out.push(`!${ref.link}`)
  for (const ref of cache.frontmatterLinks ?? []) out.push(ref.link)
  return out
}

export type VaultOrientationOptions = {
  locale?: ModelLocale
  /** Max top-level folders to list. */
  maxFolders?: number
  /** Max tags to list in the taxonomy. */
  maxTags?: number
  /** Max hub notes (highest link degree) to list. */
  maxHubs?: number
  /** Curated vault-summary folder whose files should be presented first. */
  priorityFolder?: string
  /** Max files from the curated folder to list in the system prompt. */
  maxPriorityFiles?: number
}

/**
 * Compact, tokens-bounded orientation of the vault for the system prompt: the
 * top-level folder layout, the dominant tags, and the hub notes (highest
 * link degree). Gives the model baseline bearings before it spends any tool
 * call exploring.
 */
export function buildVaultOrientation(
  app: App,
  options: VaultOrientationOptions = {},
): string | null {
  const {
    locale = getModelLocale(),
    maxFolders = 12,
    maxTags = 20,
    maxHubs = 8,
    priorityFolder = '',
    maxPriorityFiles = 30,
  } = options
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => !file.path.startsWith('.verbex'))
  if (files.length === 0) return null

  // Top-level folder layout with note counts.
  const folderCounts = new Map<string, number>()
  for (const file of files) {
    const top = file.path.includes('/') ? file.path.split('/')[0] : '(root)'
    folderCounts.set(top, (folderCounts.get(top) ?? 0) + 1)
  }
  const folders = [...folderCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxFolders)
    .map(([name, count]) => `${name} (${count})`)

  // Dominant tags.
  const tagIndex = collectTagIndex(app)
  const tags = [...tagIndex.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, maxTags)
    .map(([tag, paths]) => `#${tag} (${paths.length})`)

  // Hub notes: highest combined in+out link degree.
  const resolved: ResolvedLinks = app.metadataCache?.resolvedLinks ?? {}
  const degree = new Map<string, number>()
  for (const [source, targets] of Object.entries(resolved)) {
    const outCount = Object.values(targets).length
    degree.set(source, (degree.get(source) ?? 0) + outCount)
    for (const target of Object.keys(targets)) {
      degree.set(target, (degree.get(target) ?? 0) + 1)
    }
  }
  const hubs = [...degree.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxHubs)
    .filter(([, d]) => d > 0)
    .map(([path, d]) => `${path} (${d})`)

  const normalizedPriorityFolder = priorityFolder
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const priorityFiles = normalizedPriorityFolder
    ? files
        .filter((file) => file.path.startsWith(`${normalizedPriorityFolder}/`))
        .sort((a, b) => a.path.localeCompare(b.path))
    : []

  const lines: string[] = []
  if (normalizedPriorityFolder) {
    lines.push(
      L(
        {
          ko: `우선 참고 위키 폴더: ${normalizedPriorityFolder} (${priorityFiles.length}개). 현재 작업과 관련되면 아래 파일을 다른 파일보다 먼저 검토합니다.`,
          en: `Priority wiki folder: ${normalizedPriorityFolder} (${priorityFiles.length} files). If relevant to the current task, review the following files before others.`,
        },
        locale,
      ),
    )
    if (priorityFiles.length > 0) {
      lines.push(
        L({ ko: '우선 참고 위키 파일:', en: 'Priority wiki files:' }, locale),
      )
      lines.push(
        ...priorityFiles
          .slice(0, maxPriorityFiles)
          .map((file) => `- ${file.path}`),
      )
      if (priorityFiles.length > maxPriorityFiles) {
        lines.push(
          L(
            {
              ko: `- ... ${priorityFiles.length - maxPriorityFiles}개 생략 (list_files 또는 list_all_notes로 확인)`,
              en: `- ... ${priorityFiles.length - maxPriorityFiles} omitted (check with list_files or list_all_notes)`,
            },
            locale,
          ),
        )
      }
    }
  }
  lines.push(
    L({ ko: `노트 ${files.length}개.`, en: `${files.length} notes.` }, locale),
  )
  if (folders.length > 0)
    lines.push(
      L(
        {
          ko: `상위 폴더: ${folders.join(', ')}`,
          en: `Top-level folders: ${folders.join(', ')}`,
        },
        locale,
      ),
    )
  if (tags.length > 0)
    lines.push(
      L(
        {
          ko: `주요 태그: ${tags.join(', ')}`,
          en: `Main tags: ${tags.join(', ')}`,
        },
        locale,
      ),
    )
  if (hubs.length > 0)
    lines.push(
      L(
        {
          ko: `허브 노트(링크 차수): ${hubs.join(', ')}`,
          en: `Hub notes (link degree): ${hubs.join(', ')}`,
        },
        locale,
      ),
    )
  return lines.join('\n')
}
