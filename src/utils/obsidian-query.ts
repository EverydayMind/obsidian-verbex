import { App, TFile, getAllTags, parseFrontMatterAliases } from 'obsidian'

import { isAiPrivatePath } from '../security/aiPrivatePaths'

import { estimateTokens } from './llm/estimateTokens'
import { stringifyUnknown } from './stringifyUnknown'

type PropertyFilter = {
  key: string
  value: string
}

export type ParsedObsidianQuery = {
  propertyFilters: PropertyFilter[]
  anyTerms: string[]
  allTerms: string[]
}

export type ObsidianQueryResult = {
  file: TFile
  score: number
  line: number | null
  snippet: string
  metadata: string
}

export type ObsidianQueryOptions = {
  limit?: number
}

const PROPERTY_RE = /\[([^\]:\]]+):\s*(?:"([^"]*)"|([^\]]+))\]/g
const QUOTED_OR_BARE_RE = /"([^"]+)"|(\S+)/g

export async function searchObsidianQuery(
  app: App,
  query: string,
  options: ObsidianQueryOptions = {},
): Promise<ObsidianQueryResult[]> {
  const parsed = parseObsidianQuery(query)
  const limit = options.limit ?? 20
  const rows: ObsidianQueryResult[] = []

  for (const file of app.vault.getMarkdownFiles()) {
    if (isAiPrivatePath(file.path)) continue
    const cache = app.metadataCache?.getFileCache?.(file) ?? null
    const frontmatter = cache?.frontmatter ?? {}
    const propMatches = parsed.propertyFilters.every((filter) =>
      frontmatterMatches(frontmatter, filter),
    )
    if (!propMatches) continue

    const content = await app.vault.cachedRead(file)
    const textMatches = matchObsidianNoteText(
      file,
      content,
      cache,
      parsed,
      frontmatter,
    )
    if (!textMatches.matches) continue

    const hit = firstHit(content, [...parsed.anyTerms, ...parsed.allTerms])
    const score =
      parsed.propertyFilters.length * 10 +
      textMatches.score +
      (hit ? Math.max(0, 1 - hit.line / 1000) : 0)

    rows.push({
      file,
      score,
      line: hit?.line ?? null,
      snippet: makeSnippet(content, hit?.offset ?? 0),
      metadata: summarizeMetadata(app, file, content, cache, frontmatter),
    })
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function parseObsidianQuery(query: string): ParsedObsidianQuery {
  const propertyFilters: PropertyFilter[] = []
  let body = query
  for (const match of query.matchAll(PROPERTY_RE)) {
    propertyFilters.push({
      key: match[1].trim(),
      value: (match[2] ?? match[3] ?? '').trim(),
    })
    body = body.replace(match[0], ' ')
  }

  const trimmed = body.trim()
  if (!trimmed) return { propertyFilters, anyTerms: [], allTerms: [] }

  if (/\s+OR\s+/i.test(trimmed)) {
    return {
      propertyFilters,
      anyTerms: splitOrTerms(trimmed),
      allTerms: [],
    }
  }

  return {
    propertyFilters,
    anyTerms: [],
    allTerms: extractTerms(trimmed),
  }
}

function splitOrTerms(text: string): string[] {
  return text
    .split(/\s+OR\s+/i)
    .flatMap((segment) => extractTerms(segment.trim()))
    .filter(Boolean)
}

function extractTerms(text: string): string[] {
  const terms: string[] = []
  for (const match of text.matchAll(QUOTED_OR_BARE_RE)) {
    const term = (match[1] ?? match[2] ?? '').trim()
    if (term && term.toUpperCase() !== 'OR') terms.push(term)
  }
  return terms
}

export function frontmatterMatches(
  frontmatter: Record<string, unknown>,
  filter: PropertyFilter,
): boolean {
  const key = Object.keys(frontmatter).find(
    (candidate) => candidate.toLowerCase() === filter.key.toLowerCase(),
  )
  if (!key) return false
  return valueMatches(frontmatter[key], filter.value)
}

function valueMatches(value: unknown, expected: string): boolean {
  if (Array.isArray(value))
    return value.some((item) => valueMatches(item, expected))
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      valueMatches(item, expected),
    )
  }
  return (
    stringifyUnknown(value ?? '')
      .trim()
      .toLowerCase() === expected.toLowerCase()
  )
}

function textQueryMatches(
  text: string,
  parsed: ParsedObsidianQuery,
): { matches: boolean; score: number } {
  const lower = text.toLowerCase()
  if (parsed.anyTerms.length > 0) {
    const hits = parsed.anyTerms.filter((term) =>
      lower.includes(term.toLowerCase()),
    )
    return { matches: hits.length > 0, score: hits.length }
  }
  if (parsed.allTerms.length > 0) {
    const hits = parsed.allTerms.filter((term) =>
      lower.includes(term.toLowerCase()),
    )
    return {
      matches: hits.length === parsed.allTerms.length,
      score: hits.length,
    }
  }
  return { matches: parsed.propertyFilters.length > 0, score: 0 }
}

/** Pure note selection shared by both modes, including note-mode scoring. */
export function matchObsidianNote(
  file: Pick<TFile, 'path' | 'basename'>,
  content: string,
  cache: ReturnType<App['metadataCache']['getFileCache']> | null,
  parsed: ParsedObsidianQuery,
): { matches: boolean; score: number } {
  const frontmatter = cache?.frontmatter ?? {}
  if (
    !parsed.propertyFilters.every((filter) =>
      frontmatterMatches(frontmatter, filter),
    )
  )
    return { matches: false, score: 0 }
  return matchObsidianNoteText(file, content, cache, parsed, frontmatter)
}

/** Note mode keeps its pre-read property decision and frontmatter reference. */
function matchObsidianNoteText(
  file: Pick<TFile, 'path' | 'basename'>,
  content: string,
  cache: ReturnType<App['metadataCache']['getFileCache']> | null,
  parsed: ParsedObsidianQuery,
  frontmatter: Record<string, unknown>,
): { matches: boolean; score: number } {
  return textQueryMatches(
    [
      file.path,
      file.basename,
      content,
      JSON.stringify(frontmatter),
      tagsForCache(cache).join(' '),
      aliasesForCache(cache).join(' '),
    ].join('\n'),
    parsed,
  )
}

function firstHit(
  content: string,
  terms: string[],
): { offset: number; line: number } | null {
  const lower = content.toLowerCase()
  let best = -1
  for (const term of terms) {
    const at = lower.indexOf(term.toLowerCase())
    if (at >= 0 && (best < 0 || at < best)) best = at
  }
  if (best < 0) return null
  return {
    offset: best,
    line: content.slice(0, best).split(/\r?\n/).length,
  }
}

function makeSnippet(content: string, offset: number): string {
  const start = Math.max(offset - 120, 0)
  return content
    .slice(start, start + 320)
    .replace(/\s+/g, ' ')
    .trim()
}

function summarizeMetadata(
  app: App,
  file: TFile,
  content: string,
  cache: ReturnType<App['metadataCache']['getFileCache']> | null,
  frontmatter: Record<string, unknown>,
): string {
  const tags = tagsForCache(cache)
  const aliases = aliasesForCache(cache)
  const resolved = app.metadataCache?.resolvedLinks ?? {}
  const unresolved = app.metadataCache?.unresolvedLinks ?? {}
  const outlinks = Object.keys(resolved[file.path] ?? {}).length
  const backlinks = Object.values(resolved).filter(
    (targets) => file.path in targets,
  ).length
  const unresolvedCount = Object.keys(unresolved[file.path] ?? {}).length
  const props = Object.keys(frontmatter)
    .sort()
    .slice(0, 8)
    .map((key) => `${key}=${shortValue(frontmatter[key])}`)
  const size =
    typeof file.stat?.size === 'number' ? file.stat.size : content.length
  const pieces = [
    `size=${size}B`,
    `lines=${content.split(/\r?\n/).length}`,
    `tokens~${estimateTokens(content)}`,
    tags.length > 0 ? `tags=${tags.map((tag) => `#${tag}`).join(' ')}` : null,
    aliases.length > 0 ? `aliases=${aliases.join(', ')}` : null,
    props.length > 0 ? `props=${props.join(',')}` : null,
    `outlinks=${outlinks}`,
    `backlinks=${backlinks}`,
    unresolvedCount > 0 ? `unresolved=${unresolvedCount}` : null,
  ]
  return pieces.filter(Boolean).join('\t')
}

function tagsForCache(
  cache: ReturnType<App['metadataCache']['getFileCache']> | null,
): string[] {
  if (!cache) return []
  return [
    ...new Set(
      (getAllTags(cache) ?? [])
        .map((tag) => tag.replace(/^#/, '').trim())
        .filter(Boolean),
    ),
  ]
}

function aliasesForCache(
  cache: ReturnType<App['metadataCache']['getFileCache']> | null,
): string[] {
  return parseFrontMatterAliases(cache?.frontmatter ?? null) ?? []
}

function shortValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map(String).join('|')
    : value && typeof value === 'object'
      ? JSON.stringify(value)
      : stringifyUnknown(value ?? '')
  return JSON.stringify(text.length > 40 ? `${text.slice(0, 37)}...` : text)
}
