import type { TurnRecord } from '../runstate/turnLedger'

import { coverageItem, keepsLaterPage } from './linesCoverageFacts'

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
  for (const t of turns.flatMap((turn) => turn.truncations)) {
    const c = t.coverage
    if (!c) continue
    const label =
      c.mode === 'lines' || c.mode === 'notes'
        ? `${t.tool} ${c.mode}:${c.queryId}`
        : `${t.tool} ${t.target ?? ''}`
    if (!keepsLaterPage(latest.get(label), c)) latest.set(label, c)
  }
  return [...latest].flatMap(([label, c]) => coverageItem(label, c))
}
