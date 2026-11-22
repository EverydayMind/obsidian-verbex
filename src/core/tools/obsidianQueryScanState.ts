import type { ParsedObsidianQuery } from '../../utils/obsidian-query'

import type { LineHit } from './obsidianQueryLinesScan'
import type { LineTarget, NoteHit } from './obsidianQueryLinesSession'

/** Scan inputs and progress have no cursor, page cache, lock, or lifetime. */
export type QueryScanInput = {
  targets: LineTarget[]
  parsed: ParsedObsidianQuery
  terms: string[]
}
export type LineScanState = {
  index: number
  active?: { iterator: Generator<LineHit | null>; matched: boolean }
  pending?: LineHit
  notesScanned: number
  notesMatched: number
  noLineMatch: string[]
  skippedFiles: { path: string; reason: 'size' | 'read' }[]
  invalidated?: string
}
export type NoteScanState = Omit<LineScanState, 'pending'> & {
  pending?: NoteHit
  notesChecked: number
}
export function freshScanState(): LineScanState & { notesChecked: number } {
  return {
    index: 0,
    notesScanned: 0,
    notesMatched: 0,
    notesChecked: 0,
    noLineMatch: [],
    skippedFiles: [],
  }
}
