import type {
  ChunkLocator,
  RetrievalHit,
  RetrievalProvenance,
  RetrievalScores,
} from '../rag/retrievalTypes'

import { makeCoverageUnitId } from './coverage'

export type RetrievalDiversityOptions = {
  /** Maximum number of returned units. Omit to keep all merged candidates. */
  limit?: number
  /** Maximum units from one source path. Defaults to two. */
  maxPerPath?: number
  /** Disable conservative adjacent-chunk context expansion for RAG hits. */
  expandAdjacent?: boolean
  /** Maximum mechanically adjacent chunks added per selected hit. */
  maxAdjacentPerHit?: number
  /** Enable the structural graph fusion route. */
  expandGraph?: boolean
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined
}

function maxScore(a?: number, b?: number): number | undefined {
  const left = finiteOrUndefined(a)
  const right = finiteOrUndefined(b)
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

function mergeScores(
  left: RetrievalScores,
  right: RetrievalScores,
): RetrievalScores {
  return {
    ...(maxScore(left.vector, right.vector) !== undefined
      ? { vector: maxScore(left.vector, right.vector) }
      : {}),
    ...(maxScore(left.bm25, right.bm25) !== undefined
      ? { bm25: maxScore(left.bm25, right.bm25) }
      : {}),
    ...(maxScore(left.rerank, right.rerank) !== undefined
      ? { rerank: maxScore(left.rerank, right.rerank) }
      : {}),
    ...(maxScore(left.graph, right.graph) !== undefined
      ? { graph: maxScore(left.graph, right.graph) }
      : {}),
    ...(maxScore(left.final, right.final) !== undefined
      ? { final: maxScore(left.final, right.final) }
      : {}),
  }
}

function commonPrefix(left: string[] | undefined, right: string[] | undefined) {
  if (!left || !right) return undefined
  const length = Math.min(left.length, right.length)
  let index = 0
  while (index < length && left[index] === right[index]) index += 1
  return index > 0 ? left.slice(0, index) : undefined
}

function sameRevision(left: ChunkLocator, right: ChunkLocator): boolean {
  return left.path === right.path && left.revisionHash === right.revisionHash
}

function rangesOverlap(left: ChunkLocator, right: ChunkLocator): boolean {
  return left.startLine <= right.endLine && right.startLine <= left.endLine
}

function mergedLocator(left: ChunkLocator, right: ChunkLocator): ChunkLocator {
  const startLine = Math.min(left.startLine, right.startLine)
  const endLine = Math.max(left.endLine, right.endLine)
  const exactRange =
    left.startLine === right.startLine && left.endLine === right.endLine
  if (exactRange) return left
  return {
    unitId: makeCoverageUnitId(
      left.path,
      left.revisionHash,
      startLine,
      endLine,
    ),
    path: left.path,
    startLine,
    endLine,
    revisionHash: left.revisionHash,
    ...(commonPrefix(left.headingPath, right.headingPath)
      ? {
          headingPath: commonPrefix(left.headingPath, right.headingPath),
        }
      : {}),
    ...(left.chunkerVersion === right.chunkerVersion && left.chunkerVersion
      ? { chunkerVersion: left.chunkerVersion }
      : {}),
  }
}

function mergeHit(left: RetrievalHit, right: RetrievalHit): RetrievalHit {
  const exactRange =
    left.locator.startLine === right.locator.startLine &&
    left.locator.endLine === right.locator.endLine
  const provenance = [
    ...new Set<RetrievalProvenance>([...left.provenance, ...right.provenance]),
  ]
  const requirementIds = [
    ...new Set([
      ...(left.requirementIds ?? []),
      ...(right.requirementIds ?? []),
    ]),
  ]
  return {
    locator: mergedLocator(left.locator, right.locator),
    ...(requirementIds.length > 0 ? { requirementIds } : {}),
    ...(exactRange
      ? {
          ...(left.tokenEstimate !== undefined
            ? { tokenEstimate: left.tokenEstimate }
            : right.tokenEstimate !== undefined
              ? { tokenEstimate: right.tokenEstimate }
              : {}),
          ...(left.content !== undefined
            ? { content: left.content }
            : right.content !== undefined
              ? { content: right.content }
              : {}),
        }
      : {}),
    scores: mergeScores(left.scores, right.scores),
    provenance,
  }
}

export type DiversitySelectionState = {
  pathCounts: Map<string, number>
  selectedUnitIds: Set<string>
  representedPaths: Set<string>
}

function normalizedLimit(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.floor(value ?? fallback))
}

function selectDiverseRetrievalHitsCore(
  hits: readonly RetrievalHit[],
  options: RetrievalDiversityOptions = {},
  initialState?: DiversitySelectionState,
): RetrievalHit[] {
  const merged = mergeOverlappingRetrievalHits(hits)
  const limit = normalizedLimit(options.limit, merged.length)
  if (limit === 0) return []

  const maxPerPath = Math.max(1, Math.floor(options.maxPerPath ?? 2))
  const selected: RetrievalHit[] = []
  const pathCounts = new Map(initialState?.pathCounts ?? [])
  const selectedUnitIds = new Set(initialState?.selectedUnitIds ?? [])
  const representedPaths = new Set(initialState?.representedPaths ?? [])

  const trySelect = (hit: RetrievalHit): boolean => {
    if (selected.length >= limit || selectedUnitIds.has(hit.locator.unitId)) {
      return false
    }
    const count = pathCounts.get(hit.locator.path) ?? 0
    if (count >= maxPerPath) return false
    selected.push(hit)
    selectedUnitIds.add(hit.locator.unitId)
    pathCounts.set(hit.locator.path, count + 1)
    representedPaths.add(hit.locator.path)
    return true
  }

  for (const hit of merged) {
    if (representedPaths.has(hit.locator.path)) continue
    trySelect(hit)
    if (selected.length >= limit) return selected
  }

  for (const hit of merged) {
    trySelect(hit)
    if (selected.length >= limit) break
  }
  return selected
}

type RankedGroup = {
  hit: RetrievalHit
  firstIndex: number
}

/**
 * Merge exact or overlapping locations from the same source revision.
 * Distinct ranges remain distinct when they do not overlap. Overlap merges
 * deliberately drop the body because the helper cannot safely reconstruct
 * missing source lines; callers can hydrate the returned range later.
 */
export function mergeOverlappingRetrievalHits(
  hits: readonly RetrievalHit[],
): RetrievalHit[] {
  const ordered = hits
    .map((hit, index) => ({ hit, index }))
    .sort(
      (left, right) =>
        left.hit.locator.path.localeCompare(right.hit.locator.path) ||
        left.hit.locator.revisionHash.localeCompare(
          right.hit.locator.revisionHash,
        ) ||
        left.hit.locator.startLine - right.hit.locator.startLine ||
        left.hit.locator.endLine - right.hit.locator.endLine ||
        left.index - right.index,
    )
  const groups: RankedGroup[] = []

  for (const candidate of ordered) {
    const last = groups[groups.length - 1]
    if (
      last &&
      sameRevision(last.hit.locator, candidate.hit.locator) &&
      (last.hit.locator.unitId === candidate.hit.locator.unitId ||
        rangesOverlap(last.hit.locator, candidate.hit.locator))
    ) {
      last.hit = mergeHit(last.hit, candidate.hit)
      continue
    }
    groups.push({ hit: candidate.hit, firstIndex: candidate.index })
  }

  return groups
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map((group) => group.hit)
}

/**
 * Select a ranked, location-deduplicated candidate set while preventing one
 * file from consuming the entire targeted budget. Input order is authoritative
 * ranking; no LLM judgment or cross-source score calibration is performed.
 */
export function selectDiverseRetrievalHits(
  hits: readonly RetrievalHit[],
  options: RetrievalDiversityOptions = {},
): RetrievalHit[] {
  return selectDiverseRetrievalHitsCore(hits, options)
}

function countByPath(hits: readonly RetrievalHit[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const hit of hits) {
    counts.set(hit.locator.path, (counts.get(hit.locator.path) ?? 0) + 1)
  }
  return counts
}

/**
 * Select direct hits first, then use graph hits only for remaining slots.
 * Graph hits that identify an already selected location enrich that hit
 * without consuming another slot.
 */
export function selectDirectThenGraphHits(
  directHits: readonly RetrievalHit[],
  graphHits: readonly RetrievalHit[],
  options: RetrievalDiversityOptions = {},
): RetrievalHit[] {
  const limit = normalizedLimit(options.limit, directHits.length)
  if (limit === 0) return []

  const tier1 = selectDiverseRetrievalHits(directHits, { ...options, limit })
  let mergedTier1 = tier1
  const unmatchedGraphHits: RetrievalHit[] = []

  for (const graphHit of graphHits) {
    const overlapIndex = mergedTier1.findIndex(
      (hit) =>
        sameRevision(hit.locator, graphHit.locator) &&
        (hit.locator.unitId === graphHit.locator.unitId ||
          rangesOverlap(hit.locator, graphHit.locator)),
    )
    if (overlapIndex >= 0) {
      mergedTier1 = mergedTier1.map((hit, index) =>
        index === overlapIndex ? mergeHit(hit, graphHit) : hit,
      )
    } else {
      unmatchedGraphHits.push(graphHit)
    }
  }

  const remaining = limit - mergedTier1.length
  if (remaining <= 0) return mergedTier1

  const tier2 = selectDiverseRetrievalHitsCore(
    unmatchedGraphHits,
    { ...options, limit: remaining },
    {
      pathCounts: countByPath(mergedTier1),
      selectedUnitIds: new Set(mergedTier1.map((hit) => hit.locator.unitId)),
      representedPaths: new Set(mergedTier1.map((hit) => hit.locator.path)),
    },
  )
  return [...mergedTier1, ...tier2]
}
