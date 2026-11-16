import type { JsonObject } from '../../provider/interop/protocol'
import type { Binding, StyleSnapshot } from '../report-style/types'

import { decompositionRoles } from './decompose/roleSyntax'

export function draftRoles(
  _snapshot: StyleSnapshot,
  bindings: Binding[],
  roleCounts: Record<string, number>,
) {
  const roles: JsonObject = {}
  const role_counts: JsonObject = {}
  for (const { marker } of bindings) {
    if (marker.startsWith('SPACE:')) continue
    Object.assign(roles, decompositionRoles([marker]))
    const count = roleCounts[marker]
    if (Number.isInteger(count) && count >= 0) role_counts[marker] = count
  }
  return { roles, ...(Object.keys(role_counts).length ? { role_counts } : {}) }
}
