import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { parseObsidianQuery } from '../../utils/obsidian-query'

import { ToolArgs, ToolExecutionContext, ToolResult } from './localToolCommon'
import {
  lineTargets,
  linesPolicy,
  validateLinesSession,
} from './obsidianQueryLinesAccess'
import { LINE_LIMITS } from './obsidianQueryLinesScan'
import {
  LinesError,
  NoteHit,
  NotesSession,
  pageCursor,
  scanComplete,
} from './obsidianQueryLinesSession'
import { checkLinesAbort } from './obsidianQueryLinesWalk'
import { notesReadFacts } from './obsidianQueryNotesFacts'
import { nextNote } from './obsidianQueryNotesScan'
import { notesError, notesPageText, renderNote } from './obsidianQueryNotesText'
import { recordReturnedRows } from './obsidianQueryReturnedKeys'

export function notesIdentity(query: string): string {
  const parsed = parseObsidianQuery(query)
  const normalized = (list: string[]) =>
    [...new Set(list.map((v) => v.toLowerCase()))].sort()
  return JSON.stringify([
    'notes-v1',
    'path,basename,content,frontmatter,tags,aliases',
    parsed.propertyFilters
      .map((f) => [f.key.toLowerCase(), f.value.toLowerCase()])
      .sort(),
    normalized(parsed.anyTerms),
    normalized(parsed.allTerms),
  ])
}

async function generatePage(
  s: NotesSession,
  page: number,
  ctx: ToolExecutionContext,
  budget: number,
  deadline: number,
): Promise<ToolResult> {
  const rows: NoteHit[] = []
  const work = { deadline, bytes: 0, processed: 0, steps: 0 }
  const reserve =
    estimateTokens(
      notesPageText(s, [], pageCursor(s, Number.MAX_SAFE_INTEGER), 0, true),
    ) + 8
  let rowTokens = 0
  if (estimateTokens(notesPageText(s, [], pageCursor(s, page + 1), 0)) > budget)
    throw new LinesError('budget')
  while (rows.length < s.maxNotes) {
    checkLinesAbort(s, ctx)
    const hit = s.pending ?? (await nextNote(s, s, ctx, work))
    if (!hit) break
    s.pending = hit
    const cost = estimateTokens(renderNote(hit)) + 1
    if (reserve + rowTokens + cost > budget) {
      if (!rows.length) {
        const projected = {
          ...s,
          previewTruncated: s.previewTruncated + Number(hit.truncated),
        }
        if (
          estimateTokens(
            notesPageText(projected, [hit], pageCursor(s, page + 1), budget),
          ) > budget
        )
          throw new LinesError('budget')
        rows.push(hit)
        s.pending = undefined
      }
      break
    }
    rows.push(hit)
    rowTokens += cost
    s.pending = undefined
  }
  checkLinesAbort(s, ctx)
  validateLinesSession(s, ctx)
  const cursor = scanComplete(s) && !s.pending ? '' : pageCursor(s, page + 1)
  s.previewTruncated += rows.filter((r) => r.truncated).length
  const text = notesPageText(s, rows, cursor, budget)
  if (estimateTokens(text) > budget) throw new LinesError('budget')
  s.delivered += rows.length
  recordReturnedRows(s, page, rows)
  return {
    kind: 'read',
    facts: notesReadFacts(s, page, cursor),
    text,
    evidencePaths: rows.map((r) => r.path),
  }
}

export async function queryObsidianNotes(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const budget = Math.max(
    0,
    Math.min(Math.floor(ctx.getContextBudget() * 0.25), 6000),
  )
  const deadline = Date.now() + LINE_LIMITS.callMs
  let session: NotesSession | undefined
  try {
    const store = ctx.obsidianQueryLinesSessions
    if (!ctx.conversationId?.trim()) throw new LinesError('conversation')
    if (!store) throw new LinesError('unavailable')
    const policy = linesPolicy(ctx)
    const continuation =
      typeof args.cursor === 'string' && args.restart !== true
        ? store.lookup(args.cursor, ctx.conversationId, policy, 'notes')
        : undefined
    const query =
      typeof args.query === 'string' && args.query.trim()
        ? args.query
        : (continuation?.session.query ?? '')
    if (!query.trim())
      return { kind: 'error', message: 'obsidian_query requires "query".' }
    const parsed = parseObsidianQuery(query)
    const identity = notesIdentity(query)
    if (continuation && identity !== continuation.session.identity)
      throw new LinesError('mismatch')
    const queryId = await sha256Hex(identity)
    const requestedMax =
      typeof args.max_notes === 'number' &&
      Number.isFinite(args.max_notes) &&
      args.max_notes > 0
        ? Math.min(200, Math.max(1, Math.floor(args.max_notes)))
        : 50
    const opened = continuation ?? {
      session: store.startNotes({
        conversationId: ctx.conversationId,
        identity,
        queryId,
        query,
        policy,
        parsed,
        terms: [...parsed.anyTerms, ...parsed.allTerms].map((t) =>
          t.toLowerCase(),
        ),
        maxLines: 0,
        maxNotes: requestedMax,
        targets: lineTargets(ctx, parsed),
      }),
      page: 0,
    }
    session = opened.session
    return structuredClone(
      await store.locked(session, async () => {
        const { session: s, page } = opened
        checkLinesAbort(s, ctx)
        validateLinesSession(s, ctx)
        checkLinesAbort(s, ctx)
        if (page > s.nextPage) throw new LinesError('sequential')
        const cached = s.pages.get(page)
        if (cached) {
          store.assertLive(s)
          if (cached.kind === 'read' && estimateTokens(cached.text) > budget)
            throw new LinesError('budget')
          return cached
        }
        if (page < s.nextPage) throw new LinesError('pageExpired')
        const result = await generatePage(s, page, ctx, budget, deadline)
        store.assertLive(s)
        store.remember(s, page, result)
        return result
      }),
    )
  } catch (error) {
    if (!(error instanceof LinesError)) throw error
    const result = notesError(error, budget)
    const failed = error.session ?? session
    if (failed?.mode === 'notes' && result.kind === 'error') {
      result.facts = {
        ...notesReadFacts(failed, 0, ''),
        completeness: 'partial',
      }
      if (result.facts.coverage?.mode === 'notes')
        result.facts.coverage.deliveryComplete = false
      if (error.code === 'invalidated') result.facts.errorCode = 'invalidated'
    }
    return result
  }
}
