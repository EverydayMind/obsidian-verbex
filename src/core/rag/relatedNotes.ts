import type { ResolvedLinks } from '../../utils/vault-relations'

import {
  type DiscoveredGraphRelation,
  type GraphNoteMetadata,
  type GraphRelationKind,
  discoverBacklinkIn,
  discoverFrontmatterReferences,
  discoverSharedTagRelations,
  discoverWikilinkOut,
} from './graphRelationDiscovery'
import {
  type MarkdownLinkReference,
  extractMarkdownLinkReferences,
} from './linkedMarkdown'
import { type RankedScore, fuseRankedScores } from './retrievalFusion'
import {
  resolveAnchorLineRange,
  sliceInclusiveLines,
} from './retrievalHydration'

export type RelatedNoteSignal = 'vector' | 'bm25' | 'graph'

export const RELATED_NOTES_SECTION_LIMIT = 10

export type RelatedCandidate = {
  path: string
  title: string
  snippet: string
  source: RelatedNoteSignal
  score?: number
  relation?: GraphRelationKind
  startLine?: number
  endLine?: number
}

export type RelatedNote = {
  companionPaths?: string[]
  path: string
  title: string
  snippet: string
  signals: RelatedNoteSignal[]
  score: number | null
  category: 'similar' | 'related'
  relation?: GraphRelationKind
  startLine?: number
  endLine?: number
}

export type RelatedGraphDiscoveryInput = {
  activePath: string
  activeContent: string
  activeTags: readonly string[]
  activeFolderPath: string
  resolvedLinks: ResolvedLinks
  candidates: readonly GraphNoteMetadata[]
  frontmatterReferences: readonly {
    targetPath: string
    field?: string
  }[]
  limit: number
  signal?: AbortSignal
}

export type RelatedGraphMaterializationDeps = {
  resolveLinkedFile: (
    sourcePath: string,
    targetRef: string,
  ) => { path: string } | null
  readFile: (path: string) => Promise<string | null>
  titleForPath: (path: string) => string
  signal?: AbortSignal
}

export const RELATED_VECTOR_QUERY_LIMIT = 8

const GRAPH_RELATION_ORDER: readonly GraphRelationKind[] = [
  'wikilink_out',
  'backlink_in',
  'frontmatter_ref',
  'shared_tag',
  'adjacent',
]

export function graphRelationPriority(relation: GraphRelationKind): number {
  const index = GRAPH_RELATION_ORDER.indexOf(relation)
  return index < 0 ? GRAPH_RELATION_ORDER.length : index
}

export function extractRelatedFrontmatterReferences(
  value: unknown,
  field: string,
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      extractRelatedFrontmatterReferences(item, field),
    )
  }
  if (typeof value !== 'string') return []
  const raw = value.trim()
  if (!raw) return []
  const parsed = extractMarkdownLinkReferences(raw).map(
    (reference) => reference.target,
  )
  if (parsed.length > 0) return parsed
  return /(?:link|ref|related|parent|source|next|prev)/i.test(field)
    ? [raw]
    : []
}

export function throwIfRelatedNotesAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Related notes request aborted')
  }
}

export function isRelatedNotesAbort(
  error: unknown,
  signal?: AbortSignal,
): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error &&
      error.message === 'Related notes request aborted')
  )
}

/**
 * Pick at most `limit` rows spread across the document. Sorting by line first
 * makes the result stable even when the vector database returns rows in an
 * unspecified order.
 */
export function selectEvenlyDistributed<T>(
  rows: readonly T[],
  limit: number,
  getPosition: (row: T) => number,
  getTieBreaker: (row: T) => number | string,
): T[] {
  const max = Math.max(0, Math.floor(limit))
  if (max === 0 || rows.length === 0) return []
  const ordered = [...rows].sort(
    (left, right) =>
      getPosition(left) - getPosition(right) ||
      String(getTieBreaker(left)).localeCompare(String(getTieBreaker(right))),
  )
  if (ordered.length <= max) return ordered
  if (max === 1) return [ordered[0]]

  const selected: T[] = []
  const seen = new Set<number>()
  for (let index = 0; index < max; index += 1) {
    const position = Math.round((index * (ordered.length - 1)) / (max - 1))
    if (seen.has(position)) continue
    seen.add(position)
    selected.push(ordered[position])
  }
  return selected
}

export function discoverRelatedGraphRelations(
  input: RelatedGraphDiscoveryInput,
): DiscoveredGraphRelation[] {
  throwIfRelatedNotesAborted(input.signal)
  const seedUnitId = `related:${input.activePath}`
  const seedScore = 1
  const relations: DiscoveredGraphRelation[] = [
    ...discoverWikilinkOut(
      input.activeContent,
      input.activePath,
      seedUnitId,
      seedScore,
    ),
    ...discoverBacklinkIn(
      input.resolvedLinks,
      input.activePath,
      seedUnitId,
      seedScore,
    ),
    ...discoverSharedTagRelations(
      input.activePath,
      input.activeTags,
      input.candidates,
      seedUnitId,
      seedScore,
      undefined,
      Math.max(2, input.limit),
    ),
    ...discoverFrontmatterReferences(
      input.activePath,
      input.frontmatterReferences,
      seedUnitId,
      seedScore,
      undefined,
      Math.max(2, input.limit),
    ),
  ]

  const maxRelations = Math.max(Math.floor(input.limit) * 4, 8)
  const seen = new Set<string>()
  return relations
    .filter((relation) => {
      const target = graphRelationTargetRef(relation)
      const key = `${relation.relation}:${target}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort(
      (left, right) =>
        graphRelationPriority(left.relation) -
          graphRelationPriority(right.relation) ||
        graphRelationTargetRef(left).localeCompare(
          graphRelationTargetRef(right),
        ),
    )
    .slice(0, maxRelations)
}

export async function materializeRelatedGraphCandidates(
  relations: readonly DiscoveredGraphRelation[],
  activePath: string,
  deps: RelatedGraphMaterializationDeps,
): Promise<RelatedCandidate[]> {
  const candidates: RelatedCandidate[] = []
  for (const relation of relations) {
    throwIfRelatedNotesAborted(deps.signal)
    const targetPath = resolveRelationTargetPath(
      relation,
      activePath,
      deps.resolveLinkedFile,
    )
    if (!targetPath || targetPath === activePath) continue

    const content = await deps.readFile(targetPath)
    throwIfRelatedNotesAborted(deps.signal)
    if (content === null) continue

    const snippet = await graphSnippet(
      relation,
      targetPath,
      activePath,
      content,
      deps.resolveLinkedFile,
    )
    const range = snippet.range
    candidates.push({
      path: targetPath,
      title: deps.titleForPath(targetPath),
      snippet: snippet.text,
      source: 'graph',
      relation: relation.relation,
      ...(range ? { startLine: range.startLine, endLine: range.endLine } : {}),
    })
  }
  return candidates
}

export function groupIntoRelatedNotes(
  vectorCandidates: readonly RelatedCandidate[],
  bm25Candidates: readonly RelatedCandidate[],
  graphCandidates: readonly RelatedCandidate[],
  options: {
    activePath: string
    limit: number
    excludePath?: (path: string) => boolean
  },
): RelatedNote[] {
  const requestedLimit = Math.max(0, Math.floor(options.limit))
  if (requestedLimit === 0) return []
  const sectionLimit = Math.min(RELATED_NOTES_SECTION_LIMIT, requestedLimit)

  const include = (candidate: RelatedCandidate) =>
    !options.excludePath?.(candidate.path)
  const vector = bestCandidatesByPath(
    vectorCandidates.filter(include),
    options.activePath,
  )
  const bm25 = bestCandidatesByPath(
    bm25Candidates.filter(include),
    options.activePath,
  )
  const graph = bestGraphCandidatesByPath(
    graphCandidates.filter(include),
    options.activePath,
  )
  const fused = fuseRankedScores(toRankedScores(vector), toRankedScores(bm25), {
    strategy: 'rrf',
  })

  const similar = fused.slice(0, sectionLimit).map((entry) => {
    const vectorCandidate = vector.get(entry.id)
    const bm25Candidate = bm25.get(entry.id)
    const graphCandidate = graph.get(entry.id)
    const representative = chooseRankedRepresentative(
      vectorCandidate,
      bm25Candidate,
    )
    return {
      path: entry.id,
      title: representative?.title ?? entry.id,
      snippet: representative?.snippet ?? '',
      signals: signalsFor(vectorCandidate, bm25Candidate, graphCandidate),
      score: entry.score,
      category: 'similar' as const,
      ...(representative?.startLine !== undefined
        ? { startLine: representative.startLine }
        : {}),
      ...(representative?.endLine !== undefined
        ? { endLine: representative.endLine }
        : {}),
    }
  })

  const related = [...graph.entries()]
    .filter(([_, candidate]) => candidate.relation !== 'folder_adjacent')
    .sort(
      ([leftPath, left], [rightPath, right]) =>
        graphRelationPriority(left.relation ?? 'adjacent') -
          graphRelationPriority(right.relation ?? 'adjacent') ||
        leftPath.localeCompare(rightPath),
    )
    .slice(0, sectionLimit)
    .map(([path, candidate]) => ({
      path,
      title: candidate.title || path,
      snippet: candidate.snippet,
      signals: signalsFor(vector.get(path), bm25.get(path), candidate),
      score: null,
      category: 'related' as const,
      ...(candidate.relation ? { relation: candidate.relation } : {}),
      ...(candidate.startLine !== undefined
        ? { startLine: candidate.startLine }
        : {}),
      ...(candidate.endLine !== undefined
        ? { endLine: candidate.endLine }
        : {}),
    }))

  return [...similar, ...related]
}

function bestCandidatesByPath(
  candidates: readonly RelatedCandidate[],
  activePath: string,
): Map<string, RelatedCandidate> {
  const best = new Map<string, RelatedCandidate>()
  for (const candidate of candidates) {
    if (
      candidate.path === activePath ||
      !candidate.path ||
      !Number.isFinite(candidate.score)
    ) {
      continue
    }
    const previous = best.get(candidate.path)
    if (
      !previous ||
      (candidate.score ?? 0) > (previous.score ?? 0) ||
      ((candidate.score ?? 0) === (previous.score ?? 0) &&
        candidate.path.localeCompare(previous.path) < 0)
    ) {
      best.set(candidate.path, candidate)
    }
  }
  return best
}

function bestGraphCandidatesByPath(
  candidates: readonly RelatedCandidate[],
  activePath: string,
): Map<string, RelatedCandidate> {
  const best = new Map<string, RelatedCandidate>()
  for (const candidate of candidates) {
    if (
      candidate.path === activePath ||
      !candidate.path ||
      candidate.relation === 'folder_adjacent'
    ) {
      continue
    }
    const previous = best.get(candidate.path)
    if (
      !previous ||
      graphRelationPriority(candidate.relation ?? 'adjacent') <
        graphRelationPriority(previous.relation ?? 'adjacent') ||
      (candidate.relation === previous.relation &&
        (candidate.startLine ?? Number.MAX_SAFE_INTEGER) <
          (previous.startLine ?? Number.MAX_SAFE_INTEGER))
    ) {
      best.set(candidate.path, candidate)
    }
  }
  return best
}

function toRankedScores(
  candidates: Map<string, RelatedCandidate>,
): RankedScore[] {
  return [...candidates.entries()].map(([id, candidate]) => ({
    id,
    score: candidate.score ?? 0,
  }))
}

function chooseRankedRepresentative(
  vector: RelatedCandidate | undefined,
  bm25: RelatedCandidate | undefined,
): RelatedCandidate | undefined {
  return vector ?? bm25
}

function signalsFor(
  vector: RelatedCandidate | undefined,
  bm25: RelatedCandidate | undefined,
  graph: RelatedCandidate | undefined,
): RelatedNoteSignal[] {
  return (['vector', 'bm25', 'graph'] as const).filter((source) =>
    source === 'vector'
      ? Boolean(vector)
      : source === 'bm25'
        ? Boolean(bm25)
        : Boolean(graph),
  )
}

function graphRelationTargetRef(relation: DiscoveredGraphRelation): string {
  if (relation.relation === 'wikilink_out') return relation.targetRef
  if (relation.relation === 'adjacent') return relation.targetLocator.path
  return relation.targetPath
}

function resolveRelationTargetPath(
  relation: DiscoveredGraphRelation,
  activePath: string,
  resolveLinkedFile: RelatedGraphMaterializationDeps['resolveLinkedFile'],
): string | null {
  if (relation.relation === 'wikilink_out') {
    return resolveLinkedFile(activePath, relation.targetRef)?.path ?? null
  }
  if (relation.relation === 'adjacent') return relation.targetLocator.path
  return relation.targetPath
}

async function graphSnippet(
  relation: DiscoveredGraphRelation,
  targetPath: string,
  activePath: string,
  content: string,
  resolveLinkedFile: RelatedGraphMaterializationDeps['resolveLinkedFile'],
): Promise<{
  text: string
  range: { startLine: number; endLine: number } | null
}> {
  if (relation.relation === 'wikilink_out' && relation.anchor) {
    const range = resolveAnchorLineRange(content, relation.anchor)
    return {
      text: compactSnippet(
        sliceInclusiveLines(content, range.startLine, range.endLine),
      ),
      range: { startLine: range.startLine, endLine: range.endLine },
    }
  }

  if (relation.relation === 'backlink_in') {
    const mention = findMentionContext(
      content,
      targetPath,
      activePath,
      resolveLinkedFile,
    )
    if (mention) return mention
  }

  return {
    text: firstNoteSnippet(content),
    range: firstSnippetRange(content),
  }
}

function findMentionContext(
  content: string,
  targetPath: string,
  sourcePath: string,
  resolveLinkedFile: RelatedGraphMaterializationDeps['resolveLinkedFile'],
): {
  text: string
  range: { startLine: number; endLine: number }
} | null {
  const references = [
    ...content.matchAll(/!?(?:\[\[([^\]]+)\]\]|\[[^\]]*\]\(([^)]+)\))/g),
  ]
  for (const match of references) {
    const rawTarget = (match[1] ?? match[2] ?? '').split('|')[0].split('#')[0]
    if (
      !rawTarget ||
      resolveLinkedFile(sourcePath, rawTarget)?.path !== targetPath
    ) {
      continue
    }
    const lineStart = content.lastIndexOf('\n', match.index ?? 0) + 1
    const lineEndIndex = content.indexOf('\n', match.index ?? 0)
    const lineEnd = lineEndIndex < 0 ? content.length : lineEndIndex
    const startLine = countLines(content.slice(0, lineStart))
    return {
      text: compactSnippet(content.slice(lineStart, lineEnd)),
      range: { startLine, endLine: startLine },
    }
  }
  return null
}

function firstNoteSnippet(content: string): string {
  const heading = content.match(/^#{1,6}\s+.+$/m)
  const source =
    heading?.index !== undefined ? content.slice(heading.index) : content
  return compactSnippet(source)
}

function firstSnippetRange(
  content: string,
): { startLine: number; endLine: number } | null {
  if (!content.trim()) return null
  return {
    startLine: 1,
    endLine: Math.max(1, countLines(content.slice(0, 600))),
  }
}

function compactSnippet(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 600 ? `${compact.slice(0, 597)}…` : compact
}

function countLines(content: string): number {
  return content.length === 0 ? 1 : content.split('\n').length
}

// Keep this import in the module's public dependency graph so graph helpers
// and future callers share the same markdown-link parser contract.
export type { MarkdownLinkReference }
export { extractMarkdownLinkReferences }
