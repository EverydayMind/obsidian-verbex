import type { LinesCoverage } from '../tools/obsidianQueryLinesFacts'
import type { LineHit } from '../tools/obsidianQueryLinesScan'
import type { NoteHit } from '../tools/obsidianQueryLinesSession'
import type { NotesCoverage } from '../tools/obsidianQueryNotesFacts'
import type { ReturnedKeys } from '../tools/obsidianQueryReturnedKeys'
import type { QueryScanInput } from '../tools/obsidianQueryScanState'

export type CensusSessionRef =
  | { mode: 'lines'; sessionId: string; queryId: string }
  | { mode: 'notes'; sessionId: string; queryId: string }
export type CensusUnavailable =
  | 'expired'
  | 'evicted'
  | 'unavailable'
  | 'invalidated'
export type CensusSnapshot = QueryScanInput & {
  mode: 'lines' | 'notes'
  query: string
  queryId: string
  createdAt: number
  returnedKeys: ReturnedKeys
}
export type CensusSnapshotResult =
  | { status: 'ready'; snapshot: CensusSnapshot }
  | { status: CensusUnavailable }
export type CensusSessionPort = {
  snapshot(
    ref: CensusSessionRef,
    runId: string,
    signal?: AbortSignal,
  ): Promise<CensusSnapshotResult>
}
export type CensusReturned = 'this_turn' | 'earlier' | 'no' | 'unknown'
export type LineReportRow = LineHit & { returned: CensusReturned }
export type NoteReportRow = NoteHit & { returned: CensusReturned }
export type CensusQueryReport = {
  queryId: string
  mode: 'lines' | 'notes'
  query: string
  coverage: LinesCoverage | NotesCoverage
  status: 'complete' | 'host_partial' | CensusUnavailable
  scanned: number
  remaining: number
  skipped: number
  skippedPaths: string[]
  skippedPathsOmitted: number
  rows: (LineReportRow | NoteReportRow)[]
  rowsStoredOmitted: number
  /** Distinct matching notes before the display/storage row cap. */
  matchedNotes?: number
  sessionRef: string
  exportAvailability: 'available' | 'expired' | 'evicted' | 'invalidated'
}
/** Host-only result. Message binding and serialization belong to C2. */
export type CensusReport = {
  schemaVersion: 1
  reportId: string
  turnId: string
  sample: { call: number; capability: string; shown: number }[]
  queries: CensusQueryReport[]
}
