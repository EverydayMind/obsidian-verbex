import type { JsonObject } from '../../provider/interop/protocol'
import type { Binding, StyleSnapshot } from '../report-style/types'

import * as modelText from './documentContractText'
import { draftRoles } from './draftRoles'

/** Describes only measured bindings. Missing text statistics remain absent. */
export function draftContract(
  snapshot: StyleSnapshot,
  bindings: Binding[],
  rolesDropped: string[],
  text: { facts: JsonObject; available: boolean },
  contextsDropped: string[] = [],
  /** Measured top-level paragraphs per role marker, from the binding candidates. */
  roleCounts: Record<string, number> = {},
  baseFont?: JsonObject,
  dropReasons: Record<string, string> = {},
): JsonObject {
  return {
    ...draftRoles(snapshot, bindings, roleCounts),
    ...(baseFont ? { base_font: baseFont } : {}),
    ...(Object.keys(dropReasons).length
      ? { role_drop_reasons: dropReasons }
      : {}),
    tables: modelText.draftTables(),
    fixed_regions: [],
    style_facts: text.facts,
    roles_dropped: rolesDropped,
    not_supported: [
      ...snapshot.unsupported.map((item) =>
        [...`${item.feature}: ${item.refs.slice(0, 5).join(', ')}`]
          .slice(0, 500)
          .join(''),
      ),
      modelText.cellFormatting(),
      modelText.tableLeadingSpace(),
      ...(text.available ? [] : [modelText.sentenceStatsUnavailable()]),
      ...contextsDropped.map((key) => modelText.contextSpacingOmitted(key)),
    ].slice(0, 100),
  }
}
