import {
  CONTEXT_FOREST_DEFAULTS,
  CONTEXT_FOREST_SCORING,
  type ContextForestEdgeBreakdown,
  type ContextForestRelationType,
} from './contextForestTypes'
import type { ChunkLocator, RetrievalProvenance } from './retrievalTypes'

export type RawSourceCandidate = {
  path: string
  title?: string
  score: number
  snippet?: string
  heading?: string | null
  locator?: ChunkLocator
  revision?: string
  provenance?: RetrievalProvenance[]
}

export type FusedDirectCandidateScore = {
  path: string
  title: string
  lexicalRank: number | null
  lexicalScore: number | null
  lexicalCandidate?: RawSourceCandidate
  vectorRank: number | null
  vectorScore: number | null
  vectorCandidate?: RawSourceCandidate
  rrfScore: number
  queryScore: number
  queryScoreObserved: boolean
}

export function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  return clampRange(value, 0, 1)
}

export function computeCorpusIdf(docCount: number, df: number): number {
  if (!Number.isFinite(docCount) || docCount <= 0) {
    return 0
  }
  if (!Number.isFinite(df) || df <= 0) {
    return 0
  }
  const boundedDf = Math.min(docCount, Math.max(1, df))
  return Math.log(1 + (docCount - boundedDf + 0.5) / (boundedDf + 0.5))
}

function normalizeRankedSource(
  candidates: readonly RawSourceCandidate[],
  maxPerSource: number,
): RawSourceCandidate[] {
  const bestByPath = new Map<string, RawSourceCandidate>()
  for (const candidate of candidates) {
    if (!candidate.path || !Number.isFinite(candidate.score)) {
      continue
    }
    const existing = bestByPath.get(candidate.path)
    if (!existing || candidate.score > existing.score) {
      bestByPath.set(candidate.path, candidate)
    }
  }
  return [...bestByPath.values()]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      return a.path.localeCompare(b.path)
    })
    .slice(0, maxPerSource)
}

export function computeRrfQueryScores(input: {
  lexicalCandidates?: readonly RawSourceCandidate[]
  vectorCandidates?: readonly RawSourceCandidate[]
  lexicalActive: boolean
  vectorActive: boolean
  k?: number
  maxPerSource?: number
}): {
  activeSourceCount: number
  queryScoreObserved: boolean
  candidates: FusedDirectCandidateScore[]
  byPath: Map<string, FusedDirectCandidateScore>
} {
  const k = input.k ?? CONTEXT_FOREST_DEFAULTS.rrfK
  const maxPerSource =
    input.maxPerSource ?? CONTEXT_FOREST_DEFAULTS.maxDirectCandidatesPerSource
  const activeSourceCount =
    (input.lexicalActive ? 1 : 0) + (input.vectorActive ? 1 : 0)
  const queryScoreObserved = activeSourceCount > 0

  const lexicalRanked = input.lexicalActive
    ? normalizeRankedSource(input.lexicalCandidates ?? [], maxPerSource)
    : []
  const vectorRanked = input.vectorActive
    ? normalizeRankedSource(input.vectorCandidates ?? [], maxPerSource)
    : []

  const byPath = new Map<string, FusedDirectCandidateScore>()
  const maxPossibleRrf = activeSourceCount > 0 ? activeSourceCount / (k + 1) : 1

  lexicalRanked.forEach((candidate, index) => {
    const rank = index + 1
    const rrfScore = 1 / (k + rank)
    byPath.set(candidate.path, {
      path: candidate.path,
      title: candidate.title ?? defaultTitleFromPath(candidate.path),
      lexicalRank: rank,
      lexicalScore: candidate.score,
      lexicalCandidate: candidate,
      vectorRank: null,
      vectorScore: null,
      rrfScore,
      queryScore:
        activeSourceCount > 0 ? clamp01(rrfScore / maxPossibleRrf) : 0,
      queryScoreObserved,
    })
  })

  vectorRanked.forEach((candidate, index) => {
    const rank = index + 1
    const addRrf = 1 / (k + rank)
    const existing = byPath.get(candidate.path)
    if (existing) {
      const rrfScore = existing.rrfScore + addRrf
      existing.vectorRank = rank
      existing.vectorScore = candidate.score
      existing.vectorCandidate = candidate
      existing.rrfScore = rrfScore
      existing.queryScore =
        activeSourceCount > 0 ? clamp01(rrfScore / maxPossibleRrf) : 0
      if (!existing.title && candidate.title) {
        existing.title = candidate.title
      }
    } else {
      byPath.set(candidate.path, {
        path: candidate.path,
        title: candidate.title ?? defaultTitleFromPath(candidate.path),
        lexicalRank: null,
        lexicalScore: null,
        vectorRank: rank,
        vectorScore: candidate.score,
        vectorCandidate: candidate,
        rrfScore: addRrf,
        queryScore:
          activeSourceCount > 0 ? clamp01(addRrf / maxPossibleRrf) : 0,
        queryScoreObserved,
      })
    }
  })

  const candidates = [...byPath.values()].sort((a, b) => {
    if (b.queryScore !== a.queryScore) {
      return b.queryScore - a.queryScore
    }
    if (b.rrfScore !== a.rrfScore) {
      return b.rrfScore - a.rrfScore
    }
    return a.path.localeCompare(b.path)
  })

  return {
    activeSourceCount,
    queryScoreObserved,
    candidates,
    byPath,
  }
}

export function defaultTitleFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const base = normalized.split('/').pop() ?? normalized
  return base.replace(/\.md$/i, '')
}

export function buildTopTfIdfVector(
  termFreqs: Record<string, number>,
  getIdf: (term: string) => number,
  maxTerms = 64,
): Map<string, number> {
  const entries: [string, number][] = []
  for (const [term, tf] of Object.entries(termFreqs)) {
    if (!Number.isFinite(tf) || tf <= 0) {
      continue
    }
    const idf = getIdf(term)
    if (!Number.isFinite(idf) || idf <= 0) {
      continue
    }
    entries.push([term, tf * idf])
  }
  entries.sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1]
    }
    return a[0].localeCompare(b[0])
  })
  return new Map(entries.slice(0, maxTerms))
}

export function computeLexicalBridgeCosine(
  vecA: ReadonlyMap<string, number>,
  vecB: ReadonlyMap<string, number>,
): number {
  if (vecA.size === 0 || vecB.size === 0) {
    return 0
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [, weight] of vecA) {
    normA += weight * weight
  }
  for (const [, weight] of vecB) {
    normB += weight * weight
  }
  if (normA <= 0 || normB <= 0) {
    return 0
  }
  const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA]
  for (const [term, weightA] of smaller) {
    const weightB = larger.get(term)
    if (weightB !== undefined) {
      dot += weightA * weightB
    }
  }
  return clamp01(dot / (Math.sqrt(normA) * Math.sqrt(normB)))
}

export function computeDenseVectorCosine(
  vecA: readonly number[],
  vecB: readonly number[],
): number {
  if (vecA.length === 0 || vecA.length !== vecB.length) {
    return 0
  }
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i += 1) {
    const a = vecA[i]
    const b = vecB[i]
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return 0
    }
    dot += a * b
    normA += a * a
    normB += b * b
  }
  if (normA <= 0 || normB <= 0) {
    return 0
  }
  return clamp01(Math.max(0, dot / (Math.sqrt(normA) * Math.sqrt(normB))))
}

export function computeDenseBridgeCosine(
  chunksA?: readonly (readonly number[])[] | null,
  chunksB?: readonly (readonly number[])[] | null,
): number | null {
  if (!chunksA || chunksA.length === 0 || !chunksB || chunksB.length === 0) {
    return null
  }
  const repA = chunksA.slice(0, 3)
  const repB = chunksB.slice(0, 3)
  let best: number | null = null
  for (const a of repA) {
    for (const b of repB) {
      if (a.length === 0 || a.length !== b.length) {
        continue
      }
      const sim = computeDenseVectorCosine(a, b)
      if (best === null || sim > best) {
        best = sim
      }
    }
  }
  return best === null ? null : clamp01(best)
}

export function normalizeTagName(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase()
}

export function computeTagWeightedJaccard(
  tagsU: readonly string[],
  tagsV: readonly string[],
  getTagIdf: (tag: string) => number,
): {
  weightedJaccard: number
  sharedTags: string[]
} {
  const setU = new Set(tagsU.map(normalizeTagName).filter(Boolean))
  const setV = new Set(tagsV.map(normalizeTagName).filter(Boolean))
  if (setU.size === 0 || setV.size === 0) {
    return { weightedJaccard: 0, sharedTags: [] }
  }
  const unionTags = new Set<string>([...setU, ...setV])
  let intersectionWeight = 0
  let unionWeight = 0
  const sharedTags: string[] = []
  for (const tag of unionTags) {
    const rawIdf = getTagIdf(tag)
    const idf = Number.isFinite(rawIdf) && rawIdf > 0 ? rawIdf : 1e-6
    unionWeight += idf
    if (setU.has(tag) && setV.has(tag)) {
      intersectionWeight += idf
      sharedTags.push(tag)
    }
  }
  sharedTags.sort((a, b) => a.localeCompare(b))
  if (sharedTags.length === 0 || unionWeight <= 0) {
    return { weightedJaccard: 0, sharedTags: [] }
  }
  return {
    weightedJaccard: clamp01(intersectionWeight / unionWeight),
    sharedTags,
  }
}

export function computeStructuralRelation(input: {
  outgoingWikilink: boolean
  incomingWikilink: boolean
  outgoingFrontmatter: boolean
  incomingFrontmatter: boolean
  includeTags: boolean
  tagWeightedJaccard?: number
  sharedTags?: readonly string[]
}): {
  relation: ContextForestRelationType
  bidirectional: boolean
  structuralScore: number
} | null {
  if (input.outgoingWikilink && input.incomingWikilink) {
    return {
      relation: 'wikilink',
      bidirectional: true,
      structuralScore: 1.0,
    }
  }
  if (input.outgoingWikilink) {
    return {
      relation: 'wikilink',
      bidirectional: false,
      structuralScore: 0.85,
    }
  }
  if (input.incomingWikilink) {
    return {
      relation: 'backlink',
      bidirectional: false,
      structuralScore: 0.85,
    }
  }
  if (input.outgoingFrontmatter || input.incomingFrontmatter) {
    return {
      relation: 'frontmatter',
      bidirectional: Boolean(
        input.outgoingFrontmatter && input.incomingFrontmatter,
      ),
      structuralScore: 0.7,
    }
  }
  if (
    input.includeTags &&
    input.sharedTags &&
    input.sharedTags.length > 0 &&
    typeof input.tagWeightedJaccard === 'number' &&
    input.tagWeightedJaccard > 0
  ) {
    return {
      relation: 'tag',
      bidirectional: true,
      structuralScore: clampRange(
        CONTEXT_FOREST_SCORING.tagStructuralScale * input.tagWeightedJaccard,
        0,
        CONTEXT_FOREST_SCORING.tagStructuralScale,
      ),
    }
  }
  return null
}

export type ContextForestEdgeVerdict =
  | 'accepted'
  | 'tag_gate_rejected'
  | 'edge_weight'
  | 'score_drop'
  | 'root_floor'

/**
 * Plan §5.1 W: missing dense is dropped and the rest renormalized; explicit
 * references use `max(Wmix, H)` unless the ablation switch keeps `Wmix`.
 */
export function computeEdgeWeight(input: {
  structuralScore: number
  explicitReference: boolean
  lexicalCosine: number
  denseCosine: number | null
  enableStructuralFloor?: boolean
}): {
  mixedWeight: number
  edgeWeight: number
  structuralFloorApplied: boolean
} {
  const w = CONTEXT_FOREST_SCORING
  const h = clamp01(input.structuralScore)
  const d = input.denseCosine
  const denseWeight = d !== null && Number.isFinite(d) ? w.denseWeight : 0
  const mixedWeight = clamp01(
    (w.lexicalWeight * clamp01(input.lexicalCosine) +
      w.structuralWeight * h +
      denseWeight * clamp01(d ?? 0)) /
      (w.lexicalWeight + w.structuralWeight + denseWeight),
  )
  const useFloor =
    input.explicitReference && input.enableStructuralFloor !== false
  const raised = useFloor ? Math.max(mixedWeight, h) : mixedWeight
  return {
    mixedWeight,
    edgeWeight: clampRange(raised, 0, w.maxEdgeWeight),
    structuralFloorApplied: useFloor && h > mixedWeight,
  }
}

/**
 * Plan §5.2 propagation:
 * `S_candidate(v) = S(u) * W(u,v) * (0.75 + 0.25*q(v))`, accepted only when
 * W >= .35, `S_candidate/S(u) >= .40` and `S_candidate/S(root) >= .25`.
 * Tag-only edges additionally need `max(L, D) >= .20`.
 */
export function computeEdgeTransition(input: {
  parentScore: number
  rootScore: number
  relation: ContextForestRelationType
  structuralScore: number
  lexicalCosine: number
  denseCosine: number | null
  targetQueryScore: number
  enableStructuralFloor?: boolean
}): {
  breakdown: ContextForestEdgeBreakdown
  verdict: ContextForestEdgeVerdict
} {
  const w = CONTEXT_FOREST_SCORING
  const parentScore = clamp01(input.parentScore)
  const rootScore = clamp01(input.rootScore)
  const lexicalCosine = clamp01(input.lexicalCosine)
  const denseCosine =
    input.denseCosine !== null && Number.isFinite(input.denseCosine)
      ? clamp01(input.denseCosine)
      : null
  const weight = computeEdgeWeight({
    structuralScore: input.structuralScore,
    explicitReference: input.relation !== 'tag',
    lexicalCosine,
    denseCosine,
    enableStructuralFloor: input.enableStructuralFloor,
  })
  const { edgeWeight } = weight
  const queryFactor =
    w.queryFactorBase + w.queryFactorSlope * clamp01(input.targetQueryScore)
  const effectiveScore = clamp01(parentScore * edgeWeight * queryFactor)
  const parentRatio = parentScore > 0 ? effectiveScore / parentScore : 0
  const rootRatio = rootScore > 0 ? effectiveScore / rootScore : 0
  const breakdown: ContextForestEdgeBreakdown = {
    ...weight,
    structuralScore: clamp01(input.structuralScore),
    lexicalCosine,
    denseCosine,
    queryFactor,
    effectiveScore,
    parentRatio,
    rootRatio,
  }

  let verdict: ContextForestEdgeVerdict = 'accepted'
  if (
    input.relation === 'tag' &&
    Math.max(lexicalCosine, denseCosine ?? 0) < w.tagOnlyMinSignal
  ) {
    verdict = 'tag_gate_rejected'
  } else if (edgeWeight < w.minEdgeWeight) {
    verdict = 'edge_weight'
  } else if (parentScore <= 0 || parentRatio < w.parentDropRatio) {
    verdict = 'score_drop'
  } else if (rootScore <= 0 || rootRatio < w.rootFloorRatio) {
    verdict = 'root_floor'
  }
  return { breakdown, verdict }
}
