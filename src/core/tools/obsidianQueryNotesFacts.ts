import {
  NotesSession,
  pageCursor,
  scanComplete,
} from './obsidianQueryLinesSession'
import type { ReadFacts } from './readFacts'

export type NotesCoverage = {
  mode: 'notes'
  queryId: string
  notesTotal: number
  notesScanned: number
  notesChecked: number
  notesMatched: number
  notesDelivered: number
  skippedFiles: { path: string; reason: 'size' | 'read' }[]
  previewTruncated: number
  scanComplete: boolean
  deliveryComplete: boolean
  cursor: string
  replayCursor: string
  invalidated: boolean
  state?: never
  seen?: never
  total?: never
}

export function notesReadFacts(
  s: NotesSession,
  page: number,
  cursor: string,
): ReadFacts {
  const complete = scanComplete(s) && !s.pending && s.invalidated === undefined
  return {
    completeness: complete && !s.skippedFiles.length ? 'complete' : 'partial',
    coverage: {
      mode: 'notes',
      queryId: s.queryId,
      notesTotal: s.targets.length,
      notesScanned: s.notesScanned,
      notesChecked: s.notesChecked,
      notesMatched: s.notesMatched,
      notesDelivered: s.delivered,
      skippedFiles: s.skippedFiles.slice(0, 20).map((f) => ({ ...f })),
      previewTruncated: s.previewTruncated,
      scanComplete: scanComplete(s),
      deliveryComplete: complete,
      cursor,
      replayCursor: pageCursor(s, page),
      invalidated: s.invalidated !== undefined,
    },
  }
}
