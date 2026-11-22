import { keepsLaterPage } from '../../context/linesCoverageFacts'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import type { RequestMessage } from '../../types/llm/request'
import type { ToolCallRequest } from '../../types/tool-call.types'
import { isAbortError } from '../../utils/llm/retry'
import type { LinesCoverage } from '../tools/obsidianQueryLinesFacts'
import type { NotesCoverage } from '../tools/obsidianQueryNotesFacts'

import type { AgentLoopDeps, AgentLoopResult } from './agentLoop'
import {
  type MutationLogEntry,
  unreportedMutationFailureFacts,
} from './mutationFailureFacts'
import type { AgentToolOutcome } from './toolOutcome'

export type CoverageFinalNoticeRoute =
  | 'chat'
  | 'workflow'
  | 'batch'
  | 'document_job'
  | 'job_step'

export type CoverageFinalNoticeSkipReason =
  | 'no_queries'
  | 'complete'
  | 'invalidated'
  | 'no_cursor'
  | 'no_progress'
  | 'limit'
  | 'a13'
  | 'directive'
  | 'route'
  | 'budget'

export type CoverageFinalNoticeAudit = {
  sent: boolean
  notices: number
  skipped?: CoverageFinalNoticeSkipReason
  queries: number
  fallback?: boolean
}

export type QueryCoverageEntry = LinesCoverage | NotesCoverage

export type CoverageFinalNoticeDecision =
  | { send: true; queries: number; scannedTotal: number; noticeText: string }
  | { send: false; skipped: CoverageFinalNoticeSkipReason; queries: number }

export const MAX_COVERAGE_NOTICES_PER_TURN = 3
const MAX_NOTICE_QUERIES = 4

export function incompleteScannedTotal(
  incomplete: readonly QueryCoverageEntry[],
): number {
  return incomplete.reduce((sum, entry) => sum + entry.notesScanned, 0)
}

export function isQueryCoverage(
  coverage: NonNullable<AgentToolOutcome['readFacts']>['coverage'],
): coverage is QueryCoverageEntry {
  return coverage?.mode === 'lines' || coverage?.mode === 'notes'
}

export function isIncompleteCoverage(c: QueryCoverageEntry): boolean {
  return !c.deliveryComplete && !c.invalidated && Boolean(c.cursor)
}

export function createCoverageTracker() {
  const latestByQuery = new Map<string, QueryCoverageEntry>()
  return {
    record(outcome: Pick<AgentToolOutcome, 'readFacts'>): void {
      const coverage = outcome.readFacts?.coverage
      if (!isQueryCoverage(coverage)) return
      const key = `${coverage.mode}:${coverage.queryId}`
      if (!keepsLaterPage(latestByQuery.get(key), coverage)) {
        latestByQuery.set(key, coverage)
      }
    },
    latest(): QueryCoverageEntry[] {
      return [...latestByQuery.values()]
    },
    incomplete(): QueryCoverageEntry[] {
      return [...latestByQuery.values()].filter(isIncompleteCoverage)
    },
  }
}

function formatQueryEntry(c: QueryCoverageEntry, locale: ModelLocale): string {
  const returned = c.mode === 'notes' ? c.notesDelivered : c.linesDelivered
  return c.mode === 'notes'
    ? L(
        {
          ko: `질의 \`${c.queryId}\`: 대상 노트 ${c.notesTotal}개 중 ${c.notesScanned}개를 훑었고 도구가 ${returned}개를 반환했습니다. 다음 cursor: \`${c.cursor}\`.`,
          en: `Query \`${c.queryId}\`: scanned ${c.notesScanned} of ${c.notesTotal} target notes and the tool returned ${returned} notes. Next cursor: \`${c.cursor}\`.`,
        },
        locale,
      )
    : L(
        {
          ko: `질의 \`${c.queryId}\`: 대상 노트 ${c.notesTotal}개 중 ${c.notesScanned}개를 훑었고 도구가 ${returned}줄을 반환했습니다. 다음 cursor: \`${c.cursor}\`.`,
          en: `Query \`${c.queryId}\`: scanned ${c.notesScanned} of ${c.notesTotal} target notes and the tool returned ${returned} lines. Next cursor: \`${c.cursor}\`.`,
        },
        locale,
      )
}

export function formatCoverageFinalNotice(
  incomplete: readonly QueryCoverageEntry[],
  locale: ModelLocale = getModelLocale(),
): string {
  const shown = incomplete.slice(0, MAX_NOTICE_QUERIES)
  const overflow = incomplete.length - shown.length
  const prefix = L(
    {
      ko: `${modelMarker('systemNotice', 'ko')} 이번 턴의 전수 조회가 아직 끝나지 않았습니다.`,
      en: `${modelMarker('systemNotice', 'en')} An exhaustive query in this turn is not yet complete.`,
    },
    locale,
  )
  const headerLines =
    shown.length === 1 && overflow === 0
      ? [`${prefix} ${formatQueryEntry(shown[0], locale)}`]
      : [
          prefix,
          ...shown.map((entry) => `- ${formatQueryEntry(entry, locale)}`),
          ...(overflow > 0
            ? [
                L(
                  {
                    ko: `외 ${overflow}개 질의`,
                    en: `and ${overflow} more ${overflow === 1 ? 'query' : 'queries'}`,
                  },
                  locale,
                ),
              ]
            : []),
        ]
  return [
    ...headerLines,
    L(
      {
        ko: '원래 요청이 빠짐없이 모으는 요청이면 이 cursor로 이어 받은 뒤 답하십시오. 처음부터 다시 시작하지 말고, 완료된 조회와 변경 작업을 반복하지 마십시오.',
        en: 'If the original request asks to collect items exhaustively, continue with this cursor before answering. Do not restart from the beginning, and do not repeat completed queries or changes.',
      },
      locale,
    ),
    L(
      {
        ko: '이어 받지 않는다면 원래 요청의 범위·형식·상세도를 유지해 최종 답 전체를 다시 작성하고, 조사가 끝나지 않았다는 사실을 답에 밝히십시오. 이 안내에만 답하지 마십시오.',
        en: 'If you do not continue, rewrite your complete final answer preserving the scope, format, and level of detail of the original request, and state in your answer that the search was not completed. Do not reply only to this notice.',
      },
      locale,
    ),
  ].join('\n')
}

export function decideCoverageFinalNotice(input: {
  coverages: readonly QueryCoverageEntry[]
  route: CoverageFinalNoticeRoute
  hasDirective: boolean
  isA13: boolean
  noticesSent: number
  lastNoticeScannedTotal?: number
  iteration: number
  maxIterations: number
  locale?: ModelLocale
}): CoverageFinalNoticeDecision {
  const incomplete = input.coverages.filter(isIncompleteCoverage)
  if (incomplete.length === 0) {
    const skipped: CoverageFinalNoticeSkipReason =
      input.coverages.length === 0
        ? 'no_queries'
        : input.coverages.some((c) => c.invalidated)
          ? 'invalidated'
          : input.coverages.some((c) => !c.deliveryComplete && !c.cursor)
            ? 'no_cursor'
            : 'complete'
    return { send: false, skipped, queries: 0 }
  }
  const queries = incomplete.length
  const scannedTotal = incompleteScannedTotal(incomplete)
  if (input.isA13) return { send: false, skipped: 'a13', queries }
  if (input.hasDirective) return { send: false, skipped: 'directive', queries }
  if (input.route !== 'chat') return { send: false, skipped: 'route', queries }
  if (input.noticesSent >= MAX_COVERAGE_NOTICES_PER_TURN)
    return { send: false, skipped: 'limit', queries }
  if (
    input.noticesSent > 0 &&
    (input.lastNoticeScannedTotal === undefined ||
      scannedTotal <= input.lastNoticeScannedTotal)
  ) {
    return { send: false, skipped: 'no_progress', queries }
  }
  if (input.iteration >= input.maxIterations - 1)
    return { send: false, skipped: 'budget', queries }
  return {
    send: true,
    queries,
    scannedTotal,
    noticeText: formatCoverageFinalNotice(incomplete, input.locale),
  }
}

type FallbackContext = {
  messages: RequestMessage[]
  executedCalls: ToolCallRequest[]
  iteration: number
  evidence: AgentLoopResult['evidence']
  mutationProgress: ReadonlyMap<string, { status: string; text: string }>
  mutationLog: readonly MutationLogEntry[]
  appendNotApplied: (text: string) => string
}

export function createCoverageNoticeSession(
  deps: Pick<
    AgentLoopDeps,
    | 'coverageFinalNoticeRoute'
    | 'workflowGoal'
    | 'jobStepToolNames'
    | 'assertActive'
    | 'onCoverageFinalNoticeAudit'
  >,
) {
  const tracker = createCoverageTracker()
  let noticesSent = 0
  let lastNoticeScannedTotal: number | undefined
  let answerBeforeCoverageNotice: string | undefined
  let pendingAudit: CoverageFinalNoticeAudit | undefined

  const resolveRoute = (
    executedCalls: readonly ToolCallRequest[],
  ): CoverageFinalNoticeRoute => {
    const jobStepTools = deps.jobStepToolNames
    if (
      jobStepTools?.length &&
      executedCalls.some((call) => jobStepTools.includes(call.name))
    ) {
      return 'job_step'
    }
    return (
      deps.coverageFinalNoticeRoute ?? (deps.workflowGoal ? 'workflow' : 'chat')
    )
  }

  const recordSkipAudit = (
    skipped: CoverageFinalNoticeSkipReason,
    queries: number,
  ) => {
    if (noticesSent > 0) {
      pendingAudit = {
        sent: true,
        notices: noticesSent,
        skipped,
        queries,
      }
    } else if (!pendingAudit) {
      pendingAudit = {
        sent: false,
        notices: 0,
        skipped,
        queries,
      }
    }
  }

  const flushAudit = (fallback?: boolean) => {
    if (!pendingAudit) return
    const audit = pendingAudit
    pendingAudit = undefined
    deps.onCoverageFinalNoticeAudit?.({
      ...audit,
      ...(fallback ? { fallback: true } : {}),
    })
  }

  const fallbackResult = (
    ctx: FallbackContext,
  ): Omit<AgentLoopResult, 'mutations'> => {
    const a13Facts = unreportedMutationFailureFacts(
      ctx.mutationProgress,
      ctx.mutationLog,
    )
    const base = a13Facts
      ? [answerBeforeCoverageNotice?.trimEnd(), a13Facts]
          .filter(Boolean)
          .join('\n\n')
      : (answerBeforeCoverageNotice ?? '')
    flushAudit(true)
    return {
      messages: ctx.messages,
      finalText: ctx.appendNotApplied(base),
      iterations: ctx.iteration,
      toolCalls: ctx.executedCalls,
      stoppedReason: 'completed',
      evidence: ctx.evidence,
    }
  }

  return {
    get coverageNoticeSent() {
      return noticesSent > 0
    },
    get noticesSent() {
      return noticesSent
    },
    get answerBeforeCoverageNotice() {
      return answerBeforeCoverageNotice
    },
    hasFallback() {
      return answerBeforeCoverageNotice !== undefined
    },
    recordOutcome(outcome: Pick<AgentToolOutcome, 'readFacts'>) {
      tracker.record(outcome)
    },
    noteA13(
      iteration: number,
      maxIterations: number,
      hasDirective: boolean,
      executedCalls: readonly ToolCallRequest[],
    ) {
      const decision = decideCoverageFinalNotice({
        coverages: tracker.latest(),
        route: resolveRoute(executedCalls),
        hasDirective,
        isA13: true,
        noticesSent,
        lastNoticeScannedTotal,
        iteration,
        maxIterations,
      })
      if (!decision.send && decision.queries > 0) {
        recordSkipAudit(decision.skipped, decision.queries)
      }
    },
    maybeNotice(
      answer: string,
      iteration: number,
      maxIterations: number,
      hasDirective: boolean,
      executedCalls: readonly ToolCallRequest[],
    ): string | undefined {
      const decision = decideCoverageFinalNotice({
        coverages: tracker.latest(),
        route: resolveRoute(executedCalls),
        hasDirective,
        isA13: false,
        noticesSent,
        lastNoticeScannedTotal,
        iteration,
        maxIterations,
      })
      if (!decision.send) {
        if (decision.queries > 0) {
          recordSkipAudit(decision.skipped, decision.queries)
        } else if (noticesSent > 0 && pendingAudit) {
          const { skipped: _skipped, ...rest } = pendingAudit
          pendingAudit = rest
        }
        return undefined
      }
      deps.assertActive?.()
      noticesSent += 1
      lastNoticeScannedTotal = decision.scannedTotal
      answerBeforeCoverageNotice = answer
      pendingAudit = {
        sent: true,
        notices: noticesSent,
        queries: decision.queries,
      }
      return decision.noticeText
    },
    async completeOrFallback<T>(
      completeFn: () => Promise<T>,
      makeFallback: () => Omit<AgentLoopResult, 'mutations'>,
    ): Promise<
      | { ok: true; value: T }
      | { ok: false; result: Omit<AgentLoopResult, 'mutations'> }
    > {
      if (noticesSent > 0) deps.assertActive?.()
      try {
        return { ok: true, value: await completeFn() }
      } catch (error) {
        if (answerBeforeCoverageNotice === undefined) throw error
        deps.assertActive?.()
        if (
          isAbortError(error) ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          throw error
        }
        return { ok: false, result: makeFallback() }
      }
    },
    fallbackResult,
    flushAudit,
  }
}
