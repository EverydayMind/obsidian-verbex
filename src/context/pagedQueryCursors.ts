import type { TurnRecord } from '../runstate/turnLedger'

type Truncation = TurnRecord['truncations'][number]

/**
 * Merge paged reads of the same query over every recorded turn. The cursor is
 * the end of the page run contiguous from offset 0 for the latest total, so a
 * re-read of an earlier page or a turn without tools never moves it back.
 */
export function pagedQueryCursors(turns: readonly TurnRecord[]) {
  const groups = new Map<string, Truncation[]>()
  for (const t of turns.flatMap((turn) => turn.truncations)) {
    if (t.coverage || (t.nextOffset === undefined && t.offset === undefined))
      continue
    const key = `${t.tool} ${t.target ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  return [...groups].flatMap(([label, pages]) => {
    const total = pages.at(-1)?.total
    const spans = pages
      .filter((t) => t.total === total)
      .map((t) => [t.offset ?? 0, t.nextOffset ?? total ?? 0] as const)
      .sort((a, b) => a[0] - b[0])
    let cursor = 0
    for (const [start, end] of spans)
      if (start <= cursor) cursor = Math.max(cursor, end)
    // Only queries that were actually cut off; a direct tail read is not one.
    return pages.every((t) => t.nextOffset === undefined) ||
      (total !== undefined && cursor >= total)
      ? []
      : [{ label, cursor, total, turns: pages.length }]
  })
}
