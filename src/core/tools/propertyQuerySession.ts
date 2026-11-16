/**
 * Host-owned snapshots for exhaustive property queries (RW-06/S7, see
 * docs/plans/property-exhaustive-query-contract-2026-10-19.md). Coverage
 * counts only rows this host returned from the snapshot, never a model claim.
 * Sessions live in memory only, so a plugin restart expires every cursor.
 */
export type SnapshotRow = {
  path: string
  actual: unknown
  /** JSON of the projected values, to tell later edits from the snapshot. */
  signature: string
  projected: Record<string, unknown>
}

export type CoverageState =
  | 'complete'
  | 'partial'
  | 'interrupted'
  | 'expired'
  | 'invalidated'
  | 'mismatch'

export type QueryCoverage = {
  cursor: string
  state: CoverageState
  seen: number
  total: number
}

export const PROPERTY_QUERY_LIMITS = {
  ttlMs: 30 * 60_000,
  maxRows: 20_000,
  maxSessionsPerConversation: 4,
  maxSessions: 32,
  maxPagesPerCall: 20,
  maxCallMs: 2_000,
}

export type PropertyQuerySession = {
  cursor: string
  conversationId: string
  identity: string
  policy: string
  createdAt: number
  rows: readonly SnapshotRow[]
  distribution: string
  prop: string
  /** Projection fixed at start; later calls render with these fields. */
  fields: readonly string[]
  /** Readable condition, shown when another condition presents this cursor. */
  condition: string
  seen: Uint8Array
  seenCount: number
}

export type SessionLookup =
  | { ok: true; session: PropertyQuerySession }
  /** `condition` is set only when this conversation's cursor names another query. */
  | {
      ok: false
      state: 'expired' | 'invalidated' | 'mismatch'
      condition?: string
    }

const REVISION = 1

export class PropertyQuerySessionStore {
  private readonly sessions = new Map<string, PropertyQuerySession>()
  private counter = 0

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly limits = PROPERTY_QUERY_LIMITS,
  ) {}

  start(input: {
    conversationId: string
    identity: string
    policy: string
    rows: readonly SnapshotRow[]
    distribution: string
    prop: string
    fields: readonly string[]
    condition: string
  }): PropertyQuerySession {
    this.prune()
    const cursor = `pq${REVISION}:${this.now().toString(36)}${(this.counter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const session: PropertyQuerySession = {
      ...input,
      cursor,
      createdAt: this.now(),
      seen: new Uint8Array(input.rows.length),
      seenCount: 0,
    }
    this.sessions.set(cursor, session)
    const all = [...this.sessions.values()]
    const own = all.filter((s) => s.conversationId === input.conversationId)
    for (const [list, max] of [
      [own, this.limits.maxSessionsPerConversation],
      [all, this.limits.maxSessions],
    ] as const)
      for (const old of list.slice(0, Math.max(0, list.length - max)))
        this.sessions.delete(old.cursor)
    return session
  }

  /** A cursor counts only in its own conversation, query and access policy. */
  lookup(
    cursor: string,
    conversationId: string,
    /** null when the caller holds only the cursor (export). */
    identity: string | null,
    policy: string,
  ): SessionLookup {
    this.prune()
    const session = this.sessions.get(cursor)
    if (!session || !cursor.startsWith(`pq${REVISION}:`))
      return { ok: false, state: 'expired' }
    if (session.conversationId !== conversationId)
      return { ok: false, state: 'mismatch' }
    if (identity !== null && session.identity !== identity)
      return { ok: false, state: 'mismatch', condition: session.condition }
    if (session.policy !== policy) {
      // The old snapshot never serves as permission under a changed policy.
      this.sessions.delete(cursor)
      return { ok: false, state: 'invalidated' }
    }
    return { ok: true, session }
  }

  /** Latest unfinished snapshot of the same condition in this conversation. */
  findOpen(
    conversationId: string,
    identity: string,
    policy: string,
  ): PropertyQuerySession | undefined {
    const latest = [...this.sessions.values()]
      .filter(
        (s) =>
          s.conversationId === conversationId &&
          s.identity === identity &&
          s.seenCount < s.rows.length,
      )
      .at(-1)
    // lookup prunes by TTL and drops a snapshot whose access policy changed.
    return latest &&
      this.lookup(latest.cursor, conversationId, identity, policy).ok
      ? latest
      : undefined
  }

  markSeen(session: PropertyQuerySession, start: number, end: number) {
    for (let i = start; i < end; i++)
      if (!session.seen[i]) {
        session.seen[i] = 1
        session.seenCount++
      }
  }

  get size() {
    return this.sessions.size
  }

  private prune() {
    const cutoff = this.now() - this.limits.ttlMs
    for (const [cursor, session] of this.sessions)
      if (session.createdAt <= cutoff) this.sessions.delete(cursor)
  }
}
