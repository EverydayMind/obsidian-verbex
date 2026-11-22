import {
  LinesSession,
  pageCursor,
  scanComplete,
} from './obsidianQueryLinesSession'
import type { ReadFacts } from './readFacts'

export type LinesCoverage = {
  mode: 'lines'
  queryId: string
  scanComplete: boolean
  deliveryComplete: boolean
  /** Next page; replayCursor identifies this page, including the first page. */
  cursor: string
  replayCursor: string
  notesTotal: number
  notesScanned: number
  notesMatched: number
  noLineMatch: { count: number; paths: string[] }
  linesDelivered: number
  skippedFiles: { path: string; reason: 'size' | 'read' }[]
  previewTruncated: number
  invalidated: boolean
  /** Property-only fields are absent; retained for legacy optional access. */
  state?: never
  seen?: never
  total?: never
}

/** Snapshot values so replaying a cached page never advances its counts. */
export function linesReadFacts(
  s: LinesSession,
  page: number,
  cursor: string,
): ReadFacts {
  return {
    completeness: scanComplete(s) && !s.pending ? 'complete' : 'partial',
    coverage: {
      mode: 'lines',
      queryId: s.queryId,
      scanComplete: scanComplete(s),
      deliveryComplete: scanComplete(s) && !s.pending,
      cursor,
      replayCursor: pageCursor(s, page),
      notesTotal: s.targets.length,
      notesScanned: s.notesScanned,
      notesMatched: s.notesMatched,
      noLineMatch: {
        count: s.noLineMatch.length,
        paths: s.noLineMatch.slice(0, 20),
      },
      linesDelivered: s.delivered,
      skippedFiles: s.skippedFiles.map((f) => ({ ...f })),
      previewTruncated: s.previewTruncated,
      invalidated: s.invalidated !== undefined,
    },
  }
}
