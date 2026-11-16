import type { Binding } from '../../report-style/types'

import {
  renderedSpacingRole,
  trackedSpacingPrevious,
} from './spacingProjection'
import type { Projection } from './types'

type Occurrence = { previous: string; count: number; ref: string }
/** Table headings use unanimous contexts; prefix spacing keeps its older rule. */
export function headingSpacing(
  blocks: Projection[],
  bindings: Binding[],
): Binding[] {
  const roleCounts = new Map<string, number>()
  const groups = new Map<string, Occurrence[]>()
  const active = new Set(bindings.map((b) => b.marker))
  let previous = 'START',
    count = 0
  for (const b of blocks) {
    if (b.role === 'spacer') {
      count++
      continue
    }
    if (b.role === 'omitted') continue
    const role = renderedSpacingRole(b)
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1)
    if (b.table && /^H[1-6]$/.test(role) && active.has(role)) {
      const group = groups.get(role) ?? []
      group.push({ previous, count, ref: b.ref })
      groups.set(role, group)
    }
    previous = role
    count = 0
  }
  const result: Binding[] = []
  for (const [role, occurrences] of groups) {
    const contexts = new Map<string, Occurrence[]>()
    for (const item of occurrences)
      contexts.set(item.previous, [
        ...(contexts.get(item.previous) ?? []),
        item,
      ])
    const eligible = [...contexts.entries()].filter(
      ([p, items]) =>
        trackedSpacingPrevious(p, active) &&
        items.every((item) => item.count === items[0].count) &&
        (items.length >= 2 || roleCounts.get(p) === 1),
    )
    const covered = new Set(eligible.map(([p]) => p))
    const uncovered = occurrences.filter((item) => !covered.has(item.previous))
    const frequencies = new Map<number, number>()
    for (const item of uncovered)
      frequencies.set(item.count, (frequencies.get(item.count) ?? 0) + 1)
    // If all appearances have contexts, there is no uncovered mode; use the
    // first appearance as the deterministic fallback, then remove equal rules.
    const typical = uncovered.reduce(
      (best, item) =>
        (frequencies.get(item.count) ?? 0) > (frequencies.get(best.count) ?? 0)
          ? item
          : best,
      uncovered[0] ?? occurrences[0],
    )
    const add = (p: string, item: Occurrence) =>
      result.push({
        key: `heading-space-${result.length + 1}`,
        marker: `SPACE:${role}:${p}`,
        representativeRef: item.ref,
        assignedBy: 'rule',
      })
    add('DEFAULT', typical)
    for (const [p, items] of eligible)
      if (items[0].count !== typical.count) add(p, items[0])
  }
  return result
}
