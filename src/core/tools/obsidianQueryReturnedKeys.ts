import type { LineHit } from './obsidianQueryLinesScan'
import type { NoteHit, QuerySession } from './obsidianQueryLinesSession'

export const RETURNED_KEY_LIMIT = 20_000
export type ReturnedPage = { page: number; keys: string[] }
export type ReturnedKeys = {
  pages: ReturnedPage[]
  count: number
  unknown: boolean
}
export const rowKey = (mode: 'lines' | 'notes', row: LineHit | NoteHit) =>
  JSON.stringify(mode === 'lines' ? [row.path, row.line] : [row.path])

/** Independent of page-cache eviction. Never enters ReadFacts or the ledger. */
export function recordReturnedRows(
  s: QuerySession,
  page: number,
  rows: (LineHit | NoteHit)[],
) {
  const record = s.returnedKeys
  if (record.unknown) return
  if (record.count + rows.length > RETURNED_KEY_LIMIT) {
    record.unknown = true
    record.pages = []
    return
  }
  // Empty pages carry no returned keys and need no memory entry.
  if (!rows.length) return
  record.pages.push({
    page,
    keys: rows.map((row) => rowKey(s.mode ?? 'lines', row)),
  })
  record.count += rows.length
}
