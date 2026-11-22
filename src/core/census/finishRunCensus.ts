import { randomUUID } from '../../platform/node/api'
import type { TurnRecord } from '../../runstate/turnLedger'

import { censusAbortable } from './abort'
import { boundCensusRows } from './censusStorage'
import { turnCensusQueries } from './turnCensusQueries'
import type { CensusReport } from './types'

/** Reporting failures never change the answer or turn outcome. */
export async function finishRunCensus(
  turn: TurnRecord,
  runId: string,
  signal: AbortSignal | undefined,
  build: () => Promise<CensusReport | undefined>,
  onStatus?: (active: boolean) => void,
): Promise<CensusReport | undefined> {
  if (signal?.aborted) return undefined
  try {
    if (turnCensusQueries(turn).length) onStatus?.(true)
    const report = await censusAbortable(build(), signal)
    return signal?.aborted ? undefined : report
  } catch {
    if (signal?.aborted) return undefined
    const queries = turnCensusQueries(turn).map((item) => ({
      queryId: item.ref.queryId,
      mode: item.ref.mode,
      query: '',
      coverage: structuredClone(item.coverage),
      status: 'unavailable' as const,
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
      exportAvailability: 'expired' as const,
    }))
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
    if (!queries.length && !sample.length) return undefined
    const report: CensusReport = {
      schemaVersion: 1,
      reportId: randomUUID(),
      turnId: turn.turnId,
      sample,
      queries,
    }
    boundCensusRows(report)
    return report
  } finally {
    onStatus?.(false)
  }
}
