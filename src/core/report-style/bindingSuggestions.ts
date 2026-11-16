import { type BindingCandidate, bindingCandidates } from './bindingCandidates'
import { prefixMarkerFor } from './prefixMarker'
import { type SpacerClass, spacerClasses } from './spacerFacts'
import type { Binding, StyleSnapshot } from './types'

export { bindingCandidates } from './bindingCandidates'
export { prefixMarkerFor } from './prefixMarker'

const MAX_ROLE_BINDINGS = 8
const MAX_CONTEXT_BINDINGS = 6

/**
 * Bindings that reproduce the sample's spacing per role and context.
 *
 * Roles: one binding for the plain paragraphs (BODY), one per bullet token
 * the Exporter can match as a prefix rule, and the first numbered-heading
 * token as H1. Each representative is the first paragraph whose empty
 * paragraphs above are its class's most common sequence, so the derived rule
 * repeats that spacing for every paragraph of the role.
 *
 * Contexts: a `SPACE:<role>:<previous>` binding where the paragraphs of a
 * bound role that follow a given item (a bound role, START or TABLE) mostly
 * use a different sequence: at least two of them, and at least half of that
 * context. Measured facts choose; the model may edit before set_bindings.
 */
export function suggestBindings(snapshot: StyleSnapshot): Binding[] {
  const ranked = spacerClasses(snapshot).classes.filter((cls) => cls.typical)
  const candidates = bindingCandidates(snapshot)
  const bodyCandidate = candidates.roles.BODY[0]
  const body = ranked.find((cls) => cls.prefix === bodyCandidate?.prefix)
  if (!bodyCandidate) return []
  const roles = new Map<
    SpacerClass,
    { marker: string; candidate: BindingCandidate }
  >()
  if (body) roles.set(body, { marker: 'BODY', candidate: bodyCandidate })
  const bindings: Binding[] = [
    {
      key: 'body',
      marker: 'BODY',
      representativeRef: bodyCandidate.ref,
      assignedBy: 'model',
    },
  ]
  const otherRoles = Object.entries(candidates.roles)
    .filter(([marker, choices]) => marker !== 'BODY' && choices.length > 0)
    .sort(
      (a, b) =>
        b[1][0].paragraphs - a[1][0].paragraphs ||
        a[1][0].order - b[1][0].order,
    )
  for (const [marker, choices] of otherRoles) {
    if (bindings.length >= MAX_ROLE_BINDINGS) break
    const candidate = choices[0]
    if (
      candidate.ref === bodyCandidate.ref ||
      (marker !== 'H1' && candidate.prefix === bodyCandidate.prefix)
    )
      continue
    const cls = ranked.find((item) => item.prefix === candidate.prefix)
    // Prefix-level context statistics cannot separate two roles sharing a prefix.
    if (cls && !roles.has(cls)) roles.set(cls, { marker, candidate })
    bindings.push({
      key: marker === 'H1' ? 'heading-1' : `prefix-${bindings.length}`,
      marker,
      representativeRef: candidate.ref,
      assignedBy: 'model',
    })
  }
  const bound = new Set(bindings.map((binding) => binding.marker))
  // The Exporter's role for the item before a paragraph (contextSpacers.ts).
  const previousRole = (previous: string): string | null => {
    if (previous === 'start') return 'START'
    if (previous === 'table') return 'TABLE'
    if (previous === '') return bound.has('BODY') ? 'BODY' : null
    if (/^\d+[.)]?$/.test(previous)) return bound.has('H1') ? 'H1' : null
    const marker = prefixMarkerFor(previous)
    return marker && bound.has(marker) ? marker : null
  }
  const contexts: Binding[] = []
  for (const [cls, { marker: role, candidate }] of roles) {
    const roleSequence = candidate.spacingHeightsPt
      .map((height) => height ?? NaN)
      .join(',')
    for (const [previous, group] of Object.entries(cls.byPrevious)) {
      const typical = group.typical
      const previousKey = previousRole(previous)
      if (
        !previousKey ||
        !typical ||
        typical.count < 2 ||
        typical.count * 2 < group.paragraphs ||
        typical.heightsPt.join(',') === roleSequence
      )
        continue
      contexts.push({
        key: `space-${contexts.length + 1}`,
        marker: `SPACE:${role}:${previousKey}`,
        representativeRef: typical.ref,
        assignedBy: 'model',
      })
    }
  }
  return [...bindings, ...contexts.slice(0, MAX_CONTEXT_BINDINGS)]
}
