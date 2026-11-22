import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { parseObsidianQuery } from '../../utils/obsidian-query'

import { ToolArgs, ToolExecutionContext, ToolResult } from './localToolCommon'
import {
  lineTargets,
  linesPolicy,
  validateLinesSession,
} from './obsidianQueryLinesAccess'
import { linesReadFacts } from './obsidianQueryLinesFacts'
import { LINE_LIMITS, LineHit, lineTerms } from './obsidianQueryLinesScan'
import {
  LinesError,
  LinesSession,
  pageCursor,
  scanComplete,
} from './obsidianQueryLinesSession'
import { linesError, linesPageText, renderLine } from './obsidianQueryLinesText'
import { checkLinesAbort, nextLine } from './obsidianQueryLinesWalk'
import { recordReturnedRows } from './obsidianQueryReturnedKeys'

/** Matching rules are versioned independently of cursor storage. */
export function linesIdentity(query: string, terms: string[]): string {
  const parsed = parseObsidianQuery(query)
  const normalized = (list: string[]) =>
    [...new Set(list.map((v) => v.toLowerCase()))].sort()
  return JSON.stringify([
    'lines-v1',
    parsed.propertyFilters
      .map((f) => [f.key.toLowerCase(), f.value.toLowerCase()])
      .sort(),
    normalized(parsed.anyTerms),
    normalized(parsed.allTerms),
    normalized(terms),
  ])
}

async function generatePage(
  s: LinesSession,
  page: number,
  ctx: ToolExecutionContext,
  budget: number,
  deadline: number,
): Promise<ToolResult> {
  const rows: LineHit[] = []
  const work = { deadline, bytes: 0, processed: 0, steps: 0 }
  const reserve =
    estimateTokens(
      linesPageText(s, [], pageCursor(s, Number.MAX_SAFE_INTEGER), 0, true),
    ) + 8
  let rowTokens = 0
  if (estimateTokens(linesPageText(s, [], pageCursor(s, page + 1), 0)) > budget)
    throw new LinesError('budget')
  while (rows.length < s.maxLines) {
    checkLinesAbort(s, ctx)
    const hit = s.pending ?? (await nextLine(s, s, ctx, work))
    if (!hit) break
    s.pending = hit
    const cost = estimateTokens(renderLine(hit)) + 1
    if (reserve + rowTokens + cost > budget) {
      if (!rows.length) {
        const projected = {
          ...s,
          previewTruncated: s.previewTruncated + Number(hit.truncated),
        }
        const exact = linesPageText(
          projected,
          [hit],
          pageCursor(s, page + 1),
          budget,
        )
        if (estimateTokens(exact) > budget) throw new LinesError('budget')
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
  const text = linesPageText(s, rows, cursor, budget)
  if (estimateTokens(text) > budget) throw new LinesError('budget')
  s.delivered += rows.length
  recordReturnedRows(s, page, rows)
  return {
    kind: 'read',
    facts: linesReadFacts(s, page, cursor),
    text,
    evidencePaths: [...new Set(rows.map((r) => r.path))],
  }
}

export async function queryObsidianLines(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const budget = Math.max(
    0,
    Math.min(Math.floor(ctx.getContextBudget() * 0.25), 6000),
  )
  const deadline = Date.now() + LINE_LIMITS.callMs
  let session: LinesSession | undefined
  try {
    const store = ctx.obsidianQueryLinesSessions
    if (!ctx.conversationId?.trim()) throw new LinesError('conversation')
    if (!store) throw new LinesError('unavailable')
    const policy = linesPolicy(ctx)
    const continuation =
      typeof args.cursor === 'string' && args.restart !== true
        ? store.lookup(args.cursor, ctx.conversationId, policy)
        : undefined
    const query =
      typeof args.query === 'string' && args.query.trim()
        ? args.query
        : (continuation?.session.query ?? '')
    const parsed = parseObsidianQuery(query)
    let terms: string[]
    try {
      const supplied = args.line_terms
      const empty =
        supplied === undefined ||
        (Array.isArray(supplied) &&
          supplied.every((v) => typeof v === 'string' && !v.trim()))
      terms =
        continuation && empty
          ? continuation.session.terms
          : lineTerms(supplied, parsed)
    } catch {
      throw new LinesError('terms')
    }
    const identity = linesIdentity(query, terms)
    if (continuation && identity !== continuation.session.identity)
      throw new LinesError('mismatch')
    const queryId = await sha256Hex(identity)
    const requestedMax =
      typeof args.max_lines === 'number' &&
      Number.isFinite(args.max_lines) &&
      args.max_lines > 0
        ? Math.min(200, Math.max(1, Math.floor(args.max_lines)))
        : 60
    const opened = continuation
      ? continuation
      : {
          session: store.start({
            conversationId: ctx.conversationId,
            identity,
            queryId,
            query,
            policy,
            parsed,
            terms,
            maxLines: requestedMax,
            targets: lineTargets(ctx, parsed),
          }),
          page: 0,
        }
    session = opened.session
    return structuredClone(
      await store.locked(opened.session, async () => {
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
          return {
            ...cached,
            ...(cached.kind === 'read'
              ? { evidencePaths: [...(cached.evidencePaths ?? [])] }
              : {}),
          }
        }
        if (page < s.nextPage) throw new LinesError('pageExpired')
        const result = await generatePage(s, page, ctx, budget, deadline)
        store.assertLive(s)
        store.remember(s, page, result)
        return {
          ...result,
          ...(result.kind === 'read'
            ? { evidencePaths: [...(result.evidencePaths ?? [])] }
            : {}),
        }
      }),
    )
  } catch (error) {
    if (!(error instanceof LinesError)) throw error
    const result = linesError(error, budget)
    const failedSession = error.session ?? session
    if (
      failedSession &&
      failedSession.mode !== 'notes' &&
      result.kind === 'error'
    ) {
      result.facts = {
        ...linesReadFacts(failedSession, 0, ''),
        completeness: 'partial',
      }
      if (result.facts.coverage?.mode === 'lines')
        result.facts.coverage.deliveryComplete = false
      if (error.code === 'invalidated') result.facts.errorCode = 'invalidated'
    }
    return result
  }
}
