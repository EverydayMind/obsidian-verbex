import { L } from '../../i18n/modelText'
import { normalizePropertyLink } from '../../utils/propertyLinks'

import { ToolExecutionContext, ToolResult } from './localToolCommon'
import { PropertyQuerySpec, show } from './propertyMatch'
import { staleText } from './propertyQueryCursorText'
import type { PropertyQuerySession } from './propertyQuerySession'

/** Query identity, policy binding and cursor refusals of exhaustive queries. */
export const lowerSorted = (list: string[]) =>
  [...new Set(list.map((v) => v.trim().toLowerCase()))].sort()

/**
 * Same normalized condition means the same row set. `fields` and `limit` are
 * presentation only (v1.1): a resumed snapshot keeps its own projection.
 */
export function queryIdentity(spec: PropertyQuerySpec): string {
  return JSON.stringify([
    spec.prop.toLowerCase(),
    normalizePropertyLink(spec.value),
    spec.filterField?.toLowerCase() ?? '',
    lowerSorted(spec.include),
    lowerSorted(spec.exclude),
  ])
}

export const conditionText = (spec: PropertyQuerySpec): string =>
  L({
    ko: `${spec.prop}=${spec.value}${spec.filterField ? ` ${spec.filterField}${spec.include.length ? ` 포함 ${show(spec.include)}` : ''}${spec.exclude.length ? ` 제외 ${show(spec.exclude)}` : ''}` : ''}`,
    en: `${spec.prop}=${spec.value}${spec.filterField ? ` ${spec.filterField}${spec.include.length ? ` include ${show(spec.include)}` : ''}${spec.exclude.length ? ` exclude ${show(spec.exclude)}` : ''}` : ''}`,
  })

/** Read access today only excludes the config folder; it binds the snapshot. */
export function accessPolicyFingerprint(ctx: ToolExecutionContext): string {
  return `property-query-v1|${ctx.app.vault.configDir ?? '.obsidian'}`
}

export function stale(
  cursor: string,
  state: keyof ReturnType<typeof staleText>,
  condition?: string,
): ToolResult {
  return {
    kind: 'read',
    facts: {
      completeness: 'unsupported',
      errorCode: state === 'mismatch' ? 'cursor_mismatch' : state,
      coverage: { cursor, state, seen: 0, total: 0 },
    },
    text: L({
      ko: `전수 조회 cursor ${cursor}: ${
        condition === undefined
          ? staleText()[state]
          : `이 cursor는 조건 "${condition}"의 전수 조회입니다. 이번 호출의 조건(key·value·filter_field·include/exclude_values)이 달라 합산할 수 없습니다. 그 조건 그대로 cursor와 함께 다시 호출하세요(fields·limit은 달라도 됩니다).`
      }`,
      en: `Exhaustive query cursor ${cursor}: ${condition === undefined ? staleText()[state] : `This cursor is for the exhaustive query with condition "${condition}". This call has different conditions (key/value/filter_field/include/exclude_values), so its results cannot be combined. Call again with those same conditions and the cursor (fields/limit may differ).`}`,
    }),
  }
}

export function firstUnseen(
  session: PropertyQuerySession,
  from = 0,
): number | undefined {
  for (let i = from; i < session.rows.length; i++)
    if (!session.seen[i]) return i
  for (let i = 0; i < Math.min(from, session.rows.length); i++)
    if (!session.seen[i]) return i
  return undefined
}
