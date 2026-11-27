import type { TFile } from 'obsidian'

import {
  OBSIDIAN_QUERY_RULES_VERSION,
  type ParsedObsidianQuery,
} from '../../utils/obsidian-query'
import type { CensusSessionRef, CensusSnapshotResult } from '../census/types'

import type { ToolResult } from './localToolCommon'
import { snapshotCensusSession } from './obsidianQueryCensusSnapshot'
import { LINE_LIMITS } from './obsidianQueryLinesScan'
import type { ReturnedKeys } from './obsidianQueryReturnedKeys'
import type { LineScanState } from './obsidianQueryScanState'
import { QuerySessionHistory } from './obsidianQuerySessionHistory'

export class LinesError extends Error {
  constructor(
    public code: string,
    public path = '',
    public session?: QuerySession,
  ) {
    super(code)
  }
}
export type LineTarget = {
  path: string
  file: TFile
  mtime: number
  size: number
}
export type LinesSession = LineScanState & {
  mode?: 'lines'
  id: string
  conversationId: string
  identity: string
  queryId: string
  query: string
  policy: string
  createdAt: number
  parsed: ParsedObsidianQuery
  terms: string[]
  maxLines: number
  targets: LineTarget[]
  returnedKeys: ReturnedKeys
  delivered: number
  previewTruncated: number
  nextPage: number
  pages: Map<number, ToolResult>
  lock: Promise<void>
}
export type NoteHit = {
  path: string
  date: string
  score: number
  line: number | null
  preview: string
  truncated: boolean
}
export type NotesSession = Omit<LinesSession, 'mode' | 'pending'> & {
  mode: 'notes'
  maxNotes: number
  notesChecked: number
  pending?: NoteHit
}
export type QuerySession = LinesSession | NotesSession
type SessionInput = Pick<
  LinesSession,
  | 'conversationId'
  | 'identity'
  | 'queryId'
  | 'query'
  | 'policy'
  | 'parsed'
  | 'terms'
  | 'maxLines'
  | 'targets'
>
export const pageCursor = (session: QuerySession, page: number) =>
  `${session.id}.${page}`
export const scanComplete = (session: QuerySession) =>
  session.index === session.targets.length && !session.active

// Version the alphanumeric counter field while preserving the cursor layout.
const CURSOR_RULES = `v${OBSIDIAN_QUERY_RULES_VERSION}v`

export function normalizeLinesCursor(cursor: string): string {
  let normalized = cursor.trim()
  const trailingPunctuation = /[.,]$/.test(normalized)
  if (trailingPunctuation) normalized = normalized.slice(0, -1).trim()
  if (/^(['"`]).*\1$/.test(normalized))
    normalized = normalized.slice(1, -1).trim()
  if (!trailingPunctuation) normalized = normalized.replace(/[.,]$/, '')
  return normalized
}

/** Host memory only. TTL is creation-based; cache access never extends it. */
export class ObsidianQueryLinesSessionStore {
  private readonly sessions = new Map<string, QuerySession>()
  private counter = 0
  private readonly history = new QuerySessionHistory()
  constructor(public readonly now: () => number = Date.now) {}

  start(input: SessionInput): LinesSession {
    return this.create(input, 'lines') as LinesSession
  }

  startNotes(input: SessionInput & { maxNotes: number }): NotesSession {
    return this.create(input, 'notes') as NotesSession
  }

  private create(
    input: SessionInput & { maxNotes?: number },
    mode: 'lines' | 'notes',
  ): QuerySession {
    this.prune()
    const id = `${mode === 'notes' ? 'on1' : 'ol1'}:${this.now().toString(36)}:${CURSOR_RULES}${this.counter++}:${Math.random().toString(36).slice(2, 10)}`
    const base: LinesSession = {
      ...input,
      id,
      createdAt: this.now(),
      index: 0,
      notesScanned: 0,
      notesMatched: 0,
      noLineMatch: [],
      skippedFiles: [],
      delivered: 0,
      previewTruncated: 0,
      nextPage: 0,
      pages: new Map(),
      returnedKeys: { pages: [], count: 0, unknown: false },
      lock: Promise.resolve(),
    }
    const session: QuerySession =
      mode === 'notes'
        ? {
            ...base,
            mode: 'notes',
            maxNotes: input.maxNotes ?? 50,
            notesChecked: 0,
            pending: undefined,
          }
        : base
    this.sessions.set(id, session)
    const all = [...this.sessions.values()].filter(
      (s) => (s.mode ?? 'lines') === mode,
    )
    const own = all.filter((s) => s.conversationId === input.conversationId)
    for (const [list, max] of [
      [own, LINE_LIMITS.ownSessions],
      [all, LINE_LIMITS.sessions],
    ] as const)
      for (const old of list.slice(0, Math.max(0, list.length - max))) {
        this.history.remember(old.id, 'evicted')
        this.sessions.delete(old.id)
      }
    return session
  }

  lookup(
    cursor: string,
    conversationId: string,
    policy: string,
  ): { session: LinesSession; page: number }
  lookup(
    cursor: string,
    conversationId: string,
    policy: string,
    mode: 'notes',
  ): { session: NotesSession; page: number }
  lookup(
    cursor: string,
    conversationId: string,
    policy: string,
    mode: 'lines' | 'notes' = 'lines',
  ) {
    this.prune()
    const match = /^((?:ol1|on1):[a-z0-9]+:([a-z0-9]+):[a-z0-9]+)\.(\d+)$/.exec(
      normalizeLinesCursor(cursor),
    )
    if (!match) throw new LinesError('format')
    if (!match[1].startsWith(mode === 'notes' ? 'on1:' : 'ol1:'))
      throw new LinesError('mismatch')
    if (!match[2].startsWith(CURSOR_RULES)) throw new LinesError('rulesVersion')
    const session = this.sessions.get(match[1])
    if (!session) throw new LinesError('expired')
    if (session.conversationId !== conversationId)
      throw new LinesError('mismatch')
    if (session.policy !== policy) {
      session.invalidated = ''
      throw new LinesError('invalidated', '', session)
    }
    return { session, page: Number(match[3]) }
  }

  assertLive(session: QuerySession) {
    this.prune()
    if (this.sessions.get(session.id) !== session)
      throw new LinesError('expired')
    if (session.invalidated !== undefined)
      throw new LinesError('invalidated', session.invalidated, session)
  }

  async locked<T>(session: QuerySession, action: () => Promise<T>): Promise<T> {
    const previous = session.lock
    let release!: () => void
    session.lock = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      this.assertLive(session)
      return await action()
    } finally {
      release()
    }
  }

  remember(session: QuerySession, page: number, result: ToolResult) {
    session.pages.set(page, result)
    session.nextPage++
    if (session.pages.size > LINE_LIMITS.pages) {
      const oldest = [...session.pages.keys()][0]
      if (oldest !== undefined) session.pages.delete(oldest)
    }
  }

  get size() {
    this.prune()
    return this.sessions.size
  }
  censusMissing(id: string) {
    return this.history.reason(id)
  }
  async snapshot(
    ref: CensusSessionRef,
    runId: string,
    policy: string | (() => string),
    signal?: AbortSignal,
  ): Promise<CensusSnapshotResult> {
    this.prune()
    const session = this.sessions.get(ref.sessionId)
    if (!session) return { status: this.censusMissing(ref.sessionId) }
    return snapshotCensusSession(this, session, ref, runId, policy, signal)
  }
  private prune() {
    for (const [id, s] of this.sessions)
      if (this.now() - s.createdAt >= LINE_LIMITS.ttlMs) {
        this.history.remember(id, 'expired')
        this.sessions.delete(id)
      }
  }
}
