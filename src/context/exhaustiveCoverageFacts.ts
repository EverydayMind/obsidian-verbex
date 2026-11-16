import { L } from '../i18n/modelText'
import type { TurnRecord } from '../runstate/turnLedger'

/**
 * Host coverage of exhaustive snapshot queries from the ledger, latest result
 * per query condition (a restarted query replaces an expired cursor). Only
 * tool results move it; a tool-less turn changes nothing. A ledger cursor may
 * outlive the in-memory snapshot (plugin restart), so the line says it must
 * be continued with the cursor or restarted, never merged.
 */
export function exhaustiveCoverageItems(
  turns: readonly TurnRecord[],
): string[] {
  type Coverage = NonNullable<TurnRecord['truncations'][number]['coverage']>
  const latest = new Map<string, Coverage>()
  for (const t of turns.flatMap((turn) => turn.truncations))
    if (t.coverage) latest.set(`${t.tool} ${t.target ?? ''}`, t.coverage)
  return [...latest].flatMap(([label, c]) => {
    if (c.state === 'complete') return []
    return c.state === 'partial' || c.state === 'interrupted'
      ? [
          L({
            ko: `전수 조회 미완료: ${label} coverage ${c.seen}/${c.total} (${c.state}) — exhaustive=true, cursor="${c.cursor}"로 이어서 호출 (재시작 뒤에는 만료되어 새로 시작)`,
            en: `Exhaustive query incomplete: ${label} coverage ${c.seen}/${c.total} (${c.state}) — continue with exhaustive=true, cursor="${c.cursor}" (expires after restart; start again then)`,
          }),
        ]
      : [
          L({
            ko: `전수 조회 cursor 사용 불가: ${label} ${c.state} — cursor 없이 exhaustive=true로 새로 시작`,
            en: `Exhaustive query cursor unavailable: ${label} ${c.state} — restart with exhaustive=true and no cursor`,
          }),
        ]
  })
}
