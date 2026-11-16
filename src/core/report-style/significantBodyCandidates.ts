import type { BindingCandidate } from './bindingCandidates'

/** The existing v1 thirty-percent choice threshold, shared with decomposition. */
export function significantBodyCandidates(
  candidates: readonly BindingCandidate[],
) {
  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.paragraphs,
    0,
  )
  return candidates.filter(
    (candidate) => candidate.paragraphs * 10 >= total * 3,
  )
}
