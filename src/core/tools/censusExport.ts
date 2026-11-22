import { DEFAULT_EXPORT_FOLDER } from '../../constants'
import { t } from '../../i18n'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { scanCensus } from '../census/CensusScan'
import type { CensusQueryReport } from '../census/types'

import { renderCensusExportNote } from './censusExportNote'
import { changeHelper, str } from './localToolCommon'
import type {
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
} from './localToolCommon'
import { linesPolicy, validateLinesSession } from './obsidianQueryLinesAccess'
import { linesReadFacts } from './obsidianQueryLinesFacts'
import { pageCursor } from './obsidianQueryLinesSession'
import { notesReadFacts } from './obsidianQueryNotesFacts'

export const CENSUS_EXPORT_LIMITS = { rows: 20_000, bytes: 32 * 1024 * 1024 }
const failure = (reason: string): ToolResult => ({
  kind: 'error',
  message: `${reason} (${t('census.askAgain')})`,
})

/** Host-only: callers must establish human seed provenance before dispatch. */
export async function exportCensusReport(
  args: ToolArgs,
  ctx: ToolExecutionContext,
  now = new Date(),
): Promise<ToolResult> {
  if (
    Object.keys(args).some((key) => !['sessionRef', 'path'].includes(key)) ||
    typeof args.sessionRef !== 'string' ||
    (args.path !== undefined &&
      (typeof args.path !== 'string' || !args.path.trim()))
  )
    return failure('export_census_report: invalid arguments')
  let ref: unknown
  try {
    ref = JSON.parse(args.sessionRef)
  } catch {
    return failure('Invalid sessionRef')
  }
  if (
    !Array.isArray(ref) ||
    ref.length !== 4 ||
    typeof ref[0] !== 'string' ||
    !['lines', 'notes'].includes(ref[0]) ||
    typeof ref[1] !== 'string' ||
    typeof ref[2] !== 'string' ||
    !Number.isFinite(ref[3])
  )
    return failure('Invalid sessionRef')
  const [mode, sessionId, owner, createdAt] = ref as [
    'lines' | 'notes',
    string,
    string,
    number,
  ]
  // Chat submissions use the stable chat-<conversationId> run key across turns.
  // Never trust the owner carried by the card without comparing the current run.
  if (!ctx.conversationId || owner !== ctx.conversationId)
    return failure('Session belongs to another conversation')
  const store = ctx.obsidianQueryLinesSessions
  if (!store) return failure('Session unavailable')
  let session
  try {
    session =
      mode === 'notes'
        ? store.lookup(`${sessionId}.0`, owner, linesPolicy(ctx), 'notes')
            .session
        : store.lookup(`${sessionId}.0`, owner, linesPolicy(ctx)).session
  } catch {
    return failure(
      `Session ${store.censusMissing(sessionId) === 'unavailable' ? 'invalidated or unavailable' : store.censusMissing(sessionId)}`,
    )
  }
  if (session.createdAt !== createdAt)
    return failure('Session creation time changed')
  const found = await store.snapshot(
    { mode, sessionId, queryId: session.queryId },
    owner,
    () => linesPolicy(ctx),
    ctx.signal,
  )
  if (found.status !== 'ready') return failure(`Session ${found.status}`)
  const coverage = (
    session.mode === 'notes'
      ? notesReadFacts(
          session,
          Math.max(0, session.nextPage - 1),
          pageCursor(session, session.nextPage),
        )
      : linesReadFacts(
          session,
          Math.max(0, session.nextPage - 1),
          pageCursor(session, session.nextPage),
        )
  ).coverage
  if (!coverage || (coverage.mode !== 'lines' && coverage.mode !== 'notes'))
    return failure('Session coverage unavailable')
  const scan = await scanCensus(
    found.snapshot,
    ctx,
    {
      deadline: Date.now() + 5000,
      bytes: CENSUS_EXPORT_LIMITS.bytes,
      rows: CENSUS_EXPORT_LIMITS.rows,
    },
    true,
  )
  if (scan.status !== 'complete') return failure(`Census ${scan.status}`)
  // Recheck lifetime/policy after asynchronous reads as well.
  const live = await store.snapshot(
    { mode, sessionId, queryId: session.queryId },
    owner,
    () => linesPolicy(ctx),
    ctx.signal,
  )
  if (live.status !== 'ready') return failure(`Session ${live.status}`)
  try {
    validateLinesSession(session, ctx)
  } catch {
    return failure('Session invalidated')
  }
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const slug =
    session.query
      .replace(/[\\/:*?"<>|#^[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'census'
  const path =
    str(args, 'path') ?? `${DEFAULT_EXPORT_FOLDER}/${slug} ${stamp}.md`
  try {
    assertUserVaultPath(ctx.app, path)
  } catch (error) {
    return { kind: 'error', message: (error as Error).message }
  }
  if (!path.toLowerCase().endsWith('.md'))
    return failure('Path must end with .md')
  if (
    ctx.app.vault.getAbstractFileByPath?.(path) ??
    ctx.app.vault.getFileByPath?.(path)
  )
    return failure(`Path already exists: ${path}`)
  const query: CensusQueryReport = {
    queryId: session.queryId,
    query: session.query,
    mode,
    coverage: coverage,
    status: scan.status,
    scanned: scan.scanned,
    remaining: scan.remaining,
    skipped: scan.skippedPaths.length,
    skippedPaths: scan.skippedPaths,
    skippedPathsOmitted: 0,
    rowsStoredOmitted: scan.rows.length,
    rows: [],
    matchedNotes: new Set(scan.rows.map((r) => r.path)).size,
    sessionRef: args.sessionRef,
    exportAvailability: 'available',
  }
  const content = renderCensusExportNote(query, scan.rows, now)
  if (new TextEncoder().encode(content).length > CENSUS_EXPORT_LIMITS.bytes)
    return failure('Census export byte limit reached')
  ctx.signal?.throwIfAborted()
  return changeHelper('export_census_report', {
    op: 'create',
    kind: 'create',
    path,
    before: null,
    after: content,
  })
}
