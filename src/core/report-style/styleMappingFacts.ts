import type { RoleStyleVariant } from './profileV2'

type EffectiveRole = { ref: string; role: string | null }

/** Map observations are not claims about a later export's actual fallback. */
export function styleMappingFacts(
  nodes: EffectiveRole[],
  styles: RoleStyleVariant[],
) {
  const byRef = new Map(nodes.map((node) => [node.ref, node.role]))
  const roles = new Set(nodes.flatMap((node) => (node.role ? [node.role] : [])))
  const mappedRoles = new Set(
    styles.flatMap((style) => (style.role ? [style.role] : [])),
  )
  const mismatchedRepresentatives = styles.flatMap((style, index) => {
    const actualRole = byRef.get(style.representativeRef)
    return style.role && actualRole && actualRole !== style.role
      ? [
          {
            index,
            ref: style.representativeRef,
            expectedRole: style.role,
            actualRole,
          },
        ]
      : []
  })
  const markerRoles = new Map<string, Set<string>>()
  for (const style of styles) {
    if (!style.role) continue
    const set = markerRoles.get(style.marker) ?? new Set<string>()
    set.add(style.role)
    markerRoles.set(style.marker, set)
  }
  const sharedMarkers = [...markerRoles]
    .flatMap(([marker, values]) =>
      values.size > 1 ? [{ marker, roles: [...values].sort() }] : [],
    )
    .sort((a, b) => (a.marker < b.marker ? -1 : a.marker > b.marker ? 1 : 0))
  return {
    mismatchedRepresentatives,
    rolesWithoutStyle: [...roles]
      .filter((role) => !mappedRoles.has(role))
      .sort(),
    sharedMarkers,
  }
}
