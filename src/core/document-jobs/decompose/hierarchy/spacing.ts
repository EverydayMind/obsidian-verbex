import type { StyleSnapshot } from '../../../report-style/types'
import type { DecompositionFacts, HierarchyJudgement } from '../dialectV2'
import type { Projection } from '../types'

import { measured } from './features'
import type { RuleSummary } from './keys'
import { type Occurrence, type SpacingContext, modal } from './limits'
import { omittedSpacingFacts } from './omittedSpacing'

const spacerRef = (item: Occurrence | undefined) =>
  item && item.signature !== '[]' ? item.ref : null

/** Measure key defaults independently of the style representative. */
export function measureSpacing(
  snapshot: StyleSnapshot,
  blocks: Projection[],
  judgements: HierarchyJudgement[],
  rules: RuleSummary[],
) {
  const paragraphs = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  const byRef = new Map(judgements.map((j) => [j.ref, j.applicationKey]))
  const keys = new Map<string, Occurrence[]>(),
    contexts = new Map<string, Occurrence[]>()
  let previous = 'START'
  for (const [order, b] of blocks.entries()) {
    if (b.role === 'spacer' || b.role === 'omitted') continue
    const current =
      byRef.get(b.ref) ?? (b.role === 'data_table' ? 'TABLE' : undefined)
    if (current) {
      const sizes: (number | null)[] = []
      let i = order
      while (
        --i >= 0 &&
        blocks[i].role === 'spacer' &&
        !/^s[0-9]+\/p0$/.test(blocks[i].ref)
      ) {
        const run = paragraphs.get(blocks[i].ref)?.runs[0]
        sizes.unshift(
          measured(snapshot.characterStyles[run?.characterStyle ?? -1]?.sizePt),
        )
      }
      // Table headings use the outer paragraph's spacers, not the title cell's.
      const item = { ref: b.ref, signature: JSON.stringify(sizes), order }
      keys.set(current, [...(keys.get(current) ?? []), item])
      const context = `SPACE:${current.replace(':', '/')}:${previous.replace(':', '/')}`
      contexts.set(context, [...(contexts.get(context) ?? []), item])
    }
    previous = current ?? previous
  }
  const defaults = new Map([...keys].map(([key, group]) => [key, modal(group)]))
  const leadingSpacerRefs = new Map<string, string | null>(
    rules.map((r) => [r.key, spacerRef(defaults.get(r.key))]),
  )
  const spacing: SpacingContext[] = [],
    facts: DecompositionFacts = omittedSpacingFacts(blocks)
  for (const [key, group] of contexts) {
    const typical = modal(group)
    const refs = group
      .filter((item) => item.signature !== typical.signature)
      .map((item) => item.ref)
    if (refs.length)
      (facts.spacingVariance ??= []).push({
        contextKey: key,
        count: refs.length,
        refs,
      })
    if (
      typical.signature ===
      (key.split(':')[1] === 'TABLE'
        ? '[]'
        : defaults.get(key.split(':')[1].replace('/', ':'))?.signature)
    )
      continue
    spacing.push({
      key,
      count: group.length,
      order: group[0].order,
      representativeRef: typical.ref,
    })
    leadingSpacerRefs.set(key, spacerRef(typical))
  }
  return { spacing, leadingSpacerRefs, facts }
}
