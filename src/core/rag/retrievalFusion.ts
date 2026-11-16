export const DEFAULT_RRF_K = 60
export const RETRIEVAL_FUSION_STRATEGIES = [
  'weighted_sum',
  'rrf',
  'weighted_rrf',
] as const

export type RetrievalFusionStrategy = 'weighted_sum' | 'rrf' | 'weighted_rrf'

export type RankedScore = {
  id: string
  score: number
}

export type RetrievalFusionOptions = {
  strategy?: RetrievalFusionStrategy
  bm25Weight?: number
  limit?: number
  rrfK?: number
}

type OrderedScore = RankedScore & { sourceIndex: number }

/**
 * Fuse two already retrieved candidate lists without changing the source
 * payload. Scores are used only by weighted_sum; rank positions are used by
 * the two RRF variants. The default is the legacy weighted sum.
 */
export function fuseRankedScores(
  vectorResults: readonly RankedScore[],
  bm25Results: readonly RankedScore[],
  options: RetrievalFusionOptions = {},
): RankedScore[] {
  const strategy = options.strategy ?? 'weighted_sum'
  const bm25Weight = clampWeight(options.bm25Weight ?? 0.3)
  const limit =
    options.limit === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(Math.floor(options.limit), 0)
  const vector = normalizeSource(vectorResults)
  const bm25 = normalizeSource(bm25Results)

  const fused =
    strategy === 'weighted_sum'
      ? weightedSum(vector, bm25, bm25Weight)
      : reciprocalRankFusion(vector, bm25, {
          bm25Weight,
          k: normalizeRrfK(options.rrfK),
          weighted: strategy === 'weighted_rrf',
        })

  return fused
    .sort(
      (left, right) =>
        right.score - left.score || left.sourceIndex - right.sourceIndex,
    )
    .slice(0, limit)
    .map(({ id, score }) => ({ id, score }))
}

function normalizeSource(results: readonly RankedScore[]): OrderedScore[] {
  const bestById = new Map<string, OrderedScore>()
  results.forEach((result, sourceIndex) => {
    if (!result.id || !Number.isFinite(result.score)) return
    const candidate = { ...result, sourceIndex }
    const previous = bestById.get(result.id)
    if (
      !previous ||
      candidate.score > previous.score ||
      (candidate.score === previous.score &&
        candidate.sourceIndex < previous.sourceIndex)
    ) {
      bestById.set(result.id, candidate)
    }
  })
  return [...bestById.values()].sort(
    (left, right) =>
      right.score - left.score || left.sourceIndex - right.sourceIndex,
  )
}

function weightedSum(
  vector: readonly OrderedScore[],
  bm25: readonly OrderedScore[],
  bm25Weight: number,
): (OrderedScore & { score: number })[] {
  const maxVectorScore = maxScore(vector)
  const fused = new Map<
    string,
    { sourceIndex: number; vectorScore: number; bm25Score: number }
  >()
  vector.forEach((candidate) => {
    fused.set(candidate.id, {
      sourceIndex: candidate.sourceIndex,
      vectorScore: maxVectorScore > 0 ? candidate.score / maxVectorScore : 0,
      bm25Score: 0,
    })
  })
  bm25.forEach((candidate) => {
    const previous = fused.get(candidate.id)
    if (previous) {
      previous.bm25Score = candidate.score
    } else {
      fused.set(candidate.id, {
        sourceIndex: vector.length + candidate.sourceIndex,
        vectorScore: 0,
        bm25Score: candidate.score,
      })
    }
  })
  return [...fused.entries()].map(([id, scores]) => ({
    id,
    sourceIndex: scores.sourceIndex,
    score:
      (1 - bm25Weight) * scores.vectorScore + bm25Weight * scores.bm25Score,
  }))
}

function reciprocalRankFusion(
  vector: readonly OrderedScore[],
  bm25: readonly OrderedScore[],
  options: { bm25Weight: number; k: number; weighted: boolean },
): (OrderedScore & { score: number })[] {
  const scores = new Map<string, { score: number; sourceIndex: number }>()
  const add = (candidate: OrderedScore, rank: number, sourceWeight: number) => {
    const previous = scores.get(candidate.id)
    const contribution = sourceWeight / (options.k + rank)
    scores.set(candidate.id, {
      score: (previous?.score ?? 0) + contribution,
      sourceIndex: Math.min(
        previous?.sourceIndex ?? Infinity,
        candidate.sourceIndex,
      ),
    })
  }
  const vectorWeight = options.weighted ? 1 - options.bm25Weight : 1
  const bm25Weight = options.weighted ? options.bm25Weight : 1
  vector.forEach((candidate, index) => add(candidate, index + 1, vectorWeight))
  bm25.forEach((candidate, index) => add(candidate, index + 1, bm25Weight))
  return [...scores.entries()].map(([id, value]) => ({
    id,
    score: value.score,
    sourceIndex: value.sourceIndex,
  }))
}

function maxScore(results: readonly OrderedScore[]): number {
  return results.reduce((max, result) => Math.max(max, result.score), 0)
}

function clampWeight(weight: number): number {
  return Math.min(Math.max(weight, 0), 1)
}

function normalizeRrfK(k: number | undefined): number {
  return k === undefined || !Number.isFinite(k)
    ? DEFAULT_RRF_K
    : Math.max(Math.floor(k), 1)
}
