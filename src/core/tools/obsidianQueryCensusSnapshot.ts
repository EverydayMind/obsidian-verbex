import { censusAbortable, checkCensusAbort } from '../census/abort'
import type { CensusSessionRef, CensusSnapshotResult } from '../census/types'

import type {
  ObsidianQueryLinesSessionStore,
  QuerySession,
} from './obsidianQueryLinesSession'

/** Called under the same lock as model pages; only immutable inputs are copied. */
export async function snapshotCensusSession(
  store: ObsidianQueryLinesSessionStore,
  session: QuerySession,
  ref: CensusSessionRef,
  runId: string,
  policy: string | (() => string),
  signal?: AbortSignal,
): Promise<CensusSnapshotResult> {
  checkCensusAbort(signal)
  try {
    return await censusAbortable(
      store.locked(session, async () => {
        checkCensusAbort(signal)
        if (
          session.conversationId !== runId ||
          session.queryId !== ref.queryId ||
          (session.mode ?? 'lines') !== ref.mode
        )
          return { status: 'unavailable' } as const
        if (
          session.policy !== (typeof policy === 'function' ? policy() : policy)
        )
          return { status: 'invalidated' } as const
        return {
          status: 'ready',
          snapshot: {
            mode: ref.mode,
            query: session.query,
            queryId: session.queryId,
            createdAt: session.createdAt,
            targets: session.targets.map((t) => ({ ...t })),
            parsed: structuredClone(session.parsed),
            terms: [...session.terms],
            returnedKeys: structuredClone(session.returnedKeys),
          },
        } as const
      }),
      signal,
    )
  } catch (error) {
    checkCensusAbort(signal)
    if (session.invalidated !== undefined) return { status: 'invalidated' }
    const missing = store.censusMissing(ref.sessionId)
    if (missing !== 'unavailable') return { status: missing }
    throw error
  }
}
