import { suggestBindings } from '../../report-style/bindingSuggestions'
import { spacerClasses } from '../../report-style/spacerFacts'
import type { Binding, StyleSnapshot } from '../../report-style/types'

import { headingSpacing } from './headingSpacing'
import { spacingProjection, trackedSpacingPrevious } from './spacingProjection'
import { type Fact, type Projection, RULES } from './types'

export function resolvedSpacingFact(bindings: Binding[]): Fact {
  const rules = bindings.filter((b) => b.marker.startsWith('SPACE:'))
  return {
    step: 6,
    rule: 'resolved_role_spacing',
    refs: rules.map((b) => b.representativeRef),
    value: rules,
  }
}

/** Project resolved structural roles onto the existing spacer measurement vocabulary. */
export function spacingBindings(
  snapshot: StyleSnapshot,
  blocks: Projection[],
  bindings: Binding[],
  facts: Fact[] = [],
): Binding[] {
  const byRef = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  const projected = spacingProjection(snapshot, blocks, bindings, facts)
  // Retain ordinary prefix suggestions where applicable; structural headings need
  // resolved role context instead of the old generic TABLE context.
  const ordinary = suggestBindings(snapshot).filter((b) =>
    b.marker.startsWith('SPACE:'),
  )
  const result: Binding[] = []
  const bound = new Map(bindings.map((b) => [b.marker, b]))
  const tableRoles = new Set(
    blocks.filter((b) => b.table && /^H[1-6]$/.test(b.role)).map((b) => b.role),
  )
  for (const cls of spacerClasses(projected).classes) {
    if (cls.prefix && tableRoles.has(cls.prefix)) continue
    const binding = cls.prefix ? bound.get(cls.prefix) : undefined
    if (!cls.prefix || !binding) continue
    const representative = binding.representativeRef
    // Default sequence is the representative's real sequence, including table hosts.
    const repBlock = blocks.find(
      (b) => (b.representativeRef ?? b.ref) === representative,
    )
    let index = repBlock ? blocks.indexOf(repBlock) - 1 : -1
    const sequence: number[] = []
    while (index >= 0 && blocks[index].role === 'spacer') {
      const p = byRef.get(blocks[index--].ref)
      const size =
        snapshot.characterStyles[p?.runs[0]?.characterStyle ?? -1]?.sizePt
      sequence.unshift(size?.state === 'measured' ? size.value : NaN)
    }
    for (const [previous, group] of Object.entries(cls.byPrevious)) {
      const prev = previous === 'start' ? 'START' : previous
      const typical = group.typical
      if (
        !trackedSpacingPrevious(prev, new Set(bound.keys())) ||
        !typical ||
        typical.count < RULES.contextOccurrences ||
        typical.count * 2 < group.paragraphs ||
        typical.heightsPt.join(',') === sequence.join(',')
      )
        continue
      const marker = `SPACE:${cls.prefix}:${prev}`
      const existing = ordinary.find(
        (b) => b.marker === marker && b.representativeRef === typical.ref,
      )
      result.push({
        key: `space-${result.length + 1}`,
        marker,
        representativeRef: existing?.representativeRef ?? typical.ref,
        assignedBy: 'rule',
      })
    }
  }
  return [...result, ...headingSpacing(blocks, bindings)]
}
