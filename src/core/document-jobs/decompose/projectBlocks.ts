import type { Binding } from '../../report-style/types'

import type { TableHeading } from './headings'
import { type Block, type ModelInput, type Projection } from './types'

export function projectBlocks(
  input: ModelInput,
  body: Block[],
  heading: TableHeading[],
  roles: Map<string, string>,
  bindings: Binding[],
): Projection[] {
  const headingBindings = new Set<string>()
  return body.map((b) => {
    const h = heading.find((h) => h.block === b && h.role)
    let role = h?.role ?? roles.get(b.ref) ?? 'unclassified'
    let representativeRef = h?.titleRef
    if (h?.role && !headingBindings.has(h.role)) {
      headingBindings.add(h.role)
      bindings.push({
        key: `heading-${h.role}`,
        marker: h.role,
        representativeRef: h.titleRef,
        assignedBy: 'rule',
      })
    }
    if (b.table && !h?.role) role = 'data_table'
    const unsupported = input.snapshot.unsupported.filter((u) =>
      u.refs.includes(b.ref),
    )
    const omittedObjects = b.objects
      .filter((o) => o.kind !== 'tbl')
      .map((o) => ({ ref: o.ref, kind: o.kind }))
    if (
      unsupported.length &&
      !b.table &&
      (!b.text.trim() ||
        unsupported.some((u) =>
          /^(fieldBegin|fieldEnd|footNote|endNote)$/.test(u.feature),
        ))
    )
      role = 'omitted'
    if (
      !b.text.trim() &&
      !b.table &&
      !omittedObjects.length &&
      !unsupported.length
    )
      role = 'spacer'
    representativeRef ??= b.ref
    return {
      ...b,
      role,
      representativeRef,
      ...(h ? { headingText: h.text } : {}),
      omittedObjects,
    }
  })
}
