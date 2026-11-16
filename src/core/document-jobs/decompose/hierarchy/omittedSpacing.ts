import type { DecompositionFacts } from '../dialectV2'
import type { RoundTrip } from '../fitness'
import type { Model, Projection } from '../types'

/** Public decomposition facts contain measured losses, not source candidates. */
export function omittedSpacingLossFacts(raw: RoundTrip): DecompositionFacts {
  return {
    omittedObjectSpacing:
      raw.declaredDifferences
        ?.filter((d) => d.code === 'omittedObjectSpacing')
        .map(({ count, refs }) => ({ count, refs })) ?? [],
  }
}

/** Candidate refs only: losses require physical preview evidence. */
export function omittedSpacingFacts(blocks: Projection[]): DecompositionFacts {
  const refs = new Set<string>()
  for (const [i, b] of blocks.entries()) {
    if (b.role !== 'omitted' || !b.omittedObjects.length) continue
    for (const direction of [-1, 1]) {
      for (let j = i + direction; blocks[j]?.role === 'spacer'; j += direction)
        if (!/^s[0-9]+\/p0$/.test(blocks[j].ref)) refs.add(blocks[j].ref)
    }
  }
  return refs.size
    ? { omittedObjectSpacing: [{ count: refs.size, refs: [...refs] }] }
    : {}
}

/** Count each evidenced lost blank once; leave unrelated spacing errors intact. */
export function classifyOmittedSpacing(
  raw: RoundTrip,
  facts: DecompositionFacts,
  model: Model,
) {
  const candidates = new Set(
    facts.omittedObjectSpacing?.flatMap((f) => f.refs) ?? [],
  )
  const lost = new Set<string>(),
    covered = new Set<string>()
  let explained = 0
  for (const d of raw.omittedSpacingDifferences ?? []) {
    if (
      !raw.R4?.pairs?.some(
        (p) => p.sourceRef === d.sourceRef && p.outputRef === d.outputRef,
      )
    )
      continue
    const refs = d.refs.filter((r) => candidates.has(r))
    for (const ref of refs) lost.add(ref)
    if (refs.length === d.refs.length) explained++
    const index = model.blocks.findIndex((b) => b.ref === d.sourceRef)
    const leading: string[] = []
    for (let i = index - 1; model.blocks[i]?.role === 'spacer'; i--)
      leading.unshift(model.blocks[i].ref)
    const removed = leading.filter((ref) => refs.includes(ref)).length
    const spacing = raw.spacingDifferences?.find(
      (s) => s.sourceRef === d.sourceRef && s.outputRef === d.outputRef,
    )
    if (
      removed &&
      spacing &&
      JSON.stringify(spacing.sourceSizes.slice(removed)) ===
        JSON.stringify(spacing.outputSizes)
    )
      covered.add(d.sourceRef)
  }
  return {
    declarations: lost.size
      ? [{ code: 'omittedObjectSpacing', count: lost.size, refs: [...lost] }]
      : [],
    covered,
    unexplained: Math.max(
      0,
      (raw.omittedSpacingDifferenceCount ??
        raw.omittedSpacingDifferences?.length ??
        0) - explained,
    ),
  }
}
