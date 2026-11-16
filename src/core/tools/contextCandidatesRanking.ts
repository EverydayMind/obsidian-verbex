import { normalizePath } from 'obsidian'

import { applyRelativeFloor } from '../../context/ContextBuilder'
import { fuseRankedScores } from '../rag/retrievalFusion'

const LEXICAL_RELATIVE_FLOOR = 0.15
const SEMANTIC_RELATIVE_FLOOR = 0.35

export type Candidate = { path: string; score: number; snippet: string }
type RankedCandidate = Candidate & { id: string; rank: number }

function rankSource(
  candidates: Candidate[],
  folder: string | null,
  floor: number,
): RankedCandidate[] {
  const inFolder = candidates.filter(
    (candidate) =>
      !folder || normalizePath(candidate.path).startsWith(`${folder}/`),
  )
  const finite = inFolder
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score)
  const retained = new Set(
    applyRelativeFloor(finite, (candidate) => candidate.score, floor),
  )
  const best = new Map<string, { candidate: Candidate; index: number }>()
  for (const [index, candidate] of inFolder.entries()) {
    if (Number.isFinite(candidate.score) && !retained.has(candidate)) continue
    const id = normalizePath(candidate.path)
    const previous = best.get(id)?.candidate
    if (
      !previous ||
      (Number.isFinite(candidate.score) &&
        (!Number.isFinite(previous.score) || candidate.score > previous.score))
    )
      best.set(id, { candidate, index })
  }
  return [...best.entries()]
    .sort(([, left], [, right]) => {
      const { candidate: a } = left
      const { candidate: b } = right
      if (!Number.isFinite(a.score))
        return Number.isFinite(b.score) ? 1 : left.index - right.index
      if (!Number.isFinite(b.score)) return -1
      return b.score - a.score || left.index - right.index
    })
    .map(([id, { candidate }], index) => ({
      ...candidate,
      id,
      rank: index + 1,
    }))
}

export function rankContextCandidates(
  bm25: Candidate[],
  semantic: Candidate[],
  folder: string | null,
  limit: number,
) {
  const lexical = rankSource(bm25, folder, LEXICAL_RELATIVE_FLOOR)
  const vector = rankSource(semantic, folder, SEMANTIC_RELATIVE_FLOOR)
  const lexicalById = new Map(
    lexical.map((candidate) => [candidate.id, candidate]),
  )
  const vectorById = new Map(
    vector.map((candidate) => [candidate.id, candidate]),
  )
  const toScores = (items: RankedCandidate[]) =>
    items.map((item, index) => ({ id: item.id, score: items.length - index }))
  return fuseRankedScores(toScores(vector), toScores(lexical), {
    strategy: 'rrf',
  })
    .slice(0, limit)
    .map(({ id }) => {
      const bm25Hit = lexicalById.get(id)
      const semanticHit = vectorById.get(id)
      const selected =
        semanticHit && (!bm25Hit || semanticHit.rank <= bm25Hit.rank)
          ? semanticHit
          : bm25Hit
      if (!selected) throw new Error('Fused candidate has no source')
      return { selected, bm25Hit, semanticHit }
    })
}
