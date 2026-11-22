import { randomUUID } from '../../platform/node/api'
import type { TurnRecord } from '../../runstate/turnLedger'
import type { ToolExecutionContext } from '../tools/localToolCommon'
import { rowKey } from '../tools/obsidianQueryReturnedKeys'

import { checkCensusAbort } from './abort'
import { newCensusScanBudget, scanCensus } from './CensusScan'
import { CENSUS_STORAGE_LIMITS, boundCensusRows } from './censusStorage'
import { turnCensusQueries } from './turnCensusQueries'
import type { TurnCensusQuery } from './turnCensusQueries'
import type {
  CensusQueryReport,
  CensusReport,
  CensusSessionPort,
  CensusSnapshot,
} from './types'
export { censusBytes, CENSUS_STORAGE_LIMITS } from './censusStorage'

function returnedMarker(snapshot: CensusSnapshot, pages: Set<number>) {
  const all = new Set<string>()
  const current = new Set<string>()
  for (const page of snapshot.returnedKeys.pages)
    for (const key of page.keys) {
      all.add(key)
      if (pages.has(page.page)) current.add(key)
    }
  return (key: string) =>
    snapshot.returnedKeys.unknown
      ? ('unknown' as const)
      : current.has(key)
        ? ('this_turn' as const)
        : all.has(key)
          ? ('earlier' as const)
          : ('no' as const)
}

function emptyQuery(item: TurnCensusQuery, runId: string): CensusQueryReport {
  return {
    queryId: item.ref.queryId,
    mode: item.ref.mode,
    query: '',
    coverage: structuredClone(item.coverage),
    status: 'unavailable',
    scanned: 0,
    remaining: item.coverage.notesTotal,
    skipped: 0,
    skippedPaths: [],
    skippedPathsOmitted: 0,
    rows: [],
    rowsStoredOmitted: 0,
    sessionRef: JSON.stringify([
      item.ref.mode,
      item.ref.sessionId,
      runId,
      parseInt(item.ref.sessionId.split(':')[1], 36),
    ]),
    exportAvailability: 'expired',
  }
}

/** Only structured host facts are consumed; finalText is deliberately not an input. */
export async function buildCensusReport(
  turn: TurnRecord,
  runId: string,
  port: CensusSessionPort,
  ctx: ToolExecutionContext,
): Promise<CensusReport | undefined> {
  if (ctx.signal?.aborted) return undefined
  const items = turnCensusQueries(turn)
  const sample = turn.toolCalls.flatMap((call, i) =>
    call.status === 'succeeded' &&
    call.sample &&
    ['search_vault', 'iterative_search', 'search_context_tree'].includes(
      call.sample.capability,
    )
      ? [
          {
            call: i + 1,
            capability: call.sample.capability,
            shown: call.sample.shown,
          },
        ]
      : [],
  )
  if (!items.length && !sample.length) return undefined
  const report: CensusReport = {
    schemaVersion: 1,
    reportId: randomUUID(),
    turnId: turn.turnId,
    sample,
    queries: [],
  }
  const scanBudget = newCensusScanBudget()
  for (const item of items) {
    const query = emptyQuery(item, runId)
    try {
      checkCensusAbort(ctx.signal)
      const result = await port.snapshot(item.ref, runId, ctx.signal)
      checkCensusAbort(ctx.signal)
      if (result.status !== 'ready') {
        query.status = result.status
        query.exportAvailability =
          result.status === 'unavailable' ? 'expired' : result.status
      } else {
        const snapshot = result.snapshot
        query.query = snapshot.query
        query.sessionRef = JSON.stringify([
          item.ref.mode,
          item.ref.sessionId,
          runId,
          snapshot.createdAt,
        ])
        const scan = await scanCensus(snapshot, ctx, scanBudget)
        query.status = scan.status
        query.exportAvailability =
          scan.status === 'invalidated' ? 'invalidated' : 'available'
        query.scanned = scan.scanned
        query.remaining = scan.remaining
        query.skipped = scan.skippedPaths.length
        query.skippedPaths = scan.skippedPaths.slice(
          0,
          CENSUS_STORAGE_LIMITS.skippedPaths,
        )
        query.skippedPathsOmitted = query.skipped - query.skippedPaths.length
        query.matchedNotes = new Set(scan.rows.map((row) => row.path)).size
        const returned = returnedMarker(snapshot, item.pages)
        for (const row of scan.rows) {
          query.rows.push({
            ...row,
            returned: returned(rowKey(snapshot.mode, row)),
          })
        }
      }
    } catch {
      if (ctx.signal?.aborted) return undefined
      query.status = 'unavailable'
      query.rows = []
      query.exportAvailability = 'expired'
    }
    report.queries.push(query)
  }
  boundCensusRows(report)
  return ctx.signal?.aborted ? undefined : report
}
