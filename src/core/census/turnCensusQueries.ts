import { keepsLaterPage } from '../../context/linesCoverageFacts'
import type { TurnRecord } from '../../runstate/turnLedger'

import type { CensusQueryReport, CensusSessionRef } from './types'

export type TurnCensusQuery = {
  ref: CensusSessionRef
  coverage: CensusQueryReport['coverage']
  pages: Set<number>
}
/** Last returned session per query wins; replayed pages are counted only once. */
export function turnCensusQueries(turn: TurnRecord): TurnCensusQuery[] {
  const queries = new Map<string, TurnCensusQuery>()
  for (const item of turn.truncations) {
    const c = item.coverage
    if (!c || (c.mode !== 'lines' && c.mode !== 'notes')) continue
    const [sessionId, page] = c.replayCursor.split('.')
    if (!sessionId || !/^\d+$/.test(page ?? '')) continue
    const key = `${c.mode}:${c.queryId}`
    let current = queries.get(key)
    if (item.pageNotReturned && current && current.ref.sessionId !== sessionId)
      continue
    if (!current || current.ref.sessionId !== sessionId) {
      current = {
        ref: { mode: c.mode, sessionId, queryId: c.queryId },
        coverage: c,
        pages: new Set(),
      }
      queries.set(key, current)
    }
    if (!item.pageNotReturned) current.pages.add(Number(page))
    if (!keepsLaterPage(current.coverage, c)) current.coverage = c
  }
  return [...queries.values()]
}
