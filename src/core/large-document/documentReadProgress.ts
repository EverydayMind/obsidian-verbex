import type { ReadProgress } from '../../../contracts/agentinterop/read-progress-v1/protocol'

/** Display/coverage facts, never permission to edit. Opaque cursors are not persisted. */
export type DocumentReadFact = {
  path: string
  state: 'page' | 'unknown' | 'unavailable' | 'invalidated'
  /** Display only: whether this turn's own write caused the invalidation. */
  invalidatedBy?: 'own_write' | 'external'
  provider?: string
  page?: {
    identity: string
    scope: ReadProgress['scope']
    unit: ReadProgress['unit']
    from: number
    to: number
    total: number
    hasMore: boolean
    contentComplete: boolean
  }
}
