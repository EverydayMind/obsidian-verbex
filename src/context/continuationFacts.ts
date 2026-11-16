import { L } from '../i18n/modelText'
import { commitContinuationFacts } from '../runstate/commitTurnFacts'
import { documentReadSummaries } from '../runstate/documentReadFacts'
import type { TurnRecord } from '../runstate/turnLedger'
import { estimateTokens } from '../utils/llm/estimateTokens'

import type { ContextSection } from './ContextSection'
import { continuationReminder } from './continuationReminder'
import { isSelectionAnswer } from './continuationSelection'
import { formatDocumentJobs } from './documentJobFacts'
import { exhaustiveCoverageItems } from './exhaustiveCoverageFacts'
import { pagedQueryCursors } from './pagedQueryCursors'
import { referencedDocumentsFor } from './referencedDocuments'
import { formatStyleProfiles } from './styleProfileFacts'
import { lastAssistantText } from './taskPinning'

export function formatContinuationFacts(
  turns: TurnRecord | readonly TurnRecord[],
  request: string,
  budgetTokens = 1500,
): string | null {
  const history: readonly TurnRecord[] = Array.isArray(turns)
    ? turns
    : [turns as TurnRecord]
  const last = history.at(-1)
  if (!last) return null
  const paged = pagedQueryCursors(history)
  const exhaustive = exhaustiveCoverageItems(history)
  const candidates = last.evidence.discovered.filter(
    (p) => !last.evidence.inspected.includes(p),
  )
  const items = [
    ...candidates.map((p) =>
      L({ ko: `미확인 후보: ${p}`, en: `Uninspected candidate: ${p}` }),
    ),
    ...documentReadSummaries(history),
    ...commitContinuationFacts(last.toolCalls),
    ...last.evidence.omitted.map((p) =>
      L({ ko: `생략 경로: ${p}`, en: `Omitted path: ${p}` }),
    ),
    ...paged.map((q) =>
      L({
        ko: `잘린 결과: ${q.label} ${q.cursor}/${q.total ?? '?'} nextOffset=${q.cursor}${q.turns > 1 ? ' (여러 호출 누적 — 이 offset부터 이어서 조회)' : ''}`,
        en: `Truncated result: ${q.label} ${q.cursor}/${q.total ?? '?'} nextOffset=${q.cursor}${q.turns > 1 ? ' (accumulated across calls — continue from this offset)' : ''}`,
      }),
    ),
    ...exhaustive,
    ...last.truncations
      .filter(
        (t) =>
          !t.coverage && t.nextOffset === undefined && t.offset === undefined,
      )
      .map((t) =>
        L({
          ko: `잘린 결과: ${t.tool} ${t.target ?? ''} ${t.returned ?? '?'}/${t.total ?? '?'} nextOffset=?`,
          en: `Truncated result: ${t.tool} ${t.target ?? ''} ${t.returned ?? '?'}/${t.total ?? '?'} nextOffset=?`,
        }),
      ),
    ...last.toolCalls
      .filter((c) => c.completeness === 'unsupported')
      .map((c) =>
        L({
          ko: `미지원: ${c.name} ${c.errorCode ?? ''} ${c.target ?? ''}`,
          en: `Unsupported: ${c.name} ${c.errorCode ?? ''} ${c.target ?? ''}`,
        }),
      ),
    ...last.writes.map((w) =>
      L({
        ko: `직전 쓰기: ${w.tool} ${w.path} ${w.mutation}`,
        en: `Previous write: ${w.tool} ${w.path} ${w.mutation}`,
      }),
    ),
  ]
  const selection = isSelectionAnswer(request)
  if (!items.length && !selection) return null
  const header = L({
    ko: `[직전 실행 사실 — host 기록, 근거 아님]\n미확인 후보 ${candidates.length}개. 남은 항목이 이번 작업에 해당하면 도구로 확인하세요.${paged.length ? '\n잘린 페이지 조회는 표시된 nextOffset부터 이어서 호출하고, 끝까지 확인하기 전에는 전체 결과라고 답하지 마세요.' : ''}${exhaustive.length ? '\n전수 조회는 host coverage가 완료되기 전에는 전체 결과가 아닙니다.' : ''}${selection ? '\n이 답은 직전 assistant 질문에 대한 선택이다.' : ''}`,
    en: `[Previous execution facts — host records, not evidence]\n${candidates.length} uninspected candidates. Check remaining items with tools if relevant to this task.${paged.length ? '\nContinue truncated page queries from the displayed nextOffset; do not claim complete results before checking every page.' : ''}${exhaustive.length ? '\nAn exhaustive query is incomplete until host coverage is complete.' : ''}${selection ? '\nThis answer selects an option from the previous assistant question.' : ''}`,
  })
  const budget = Math.max(0, Math.min(1500, budgetTokens))
  const selected = [
    ...items.slice(candidates.length),
    ...items.slice(0, Math.min(20, candidates.length)),
  ]
  for (let remaining = selected.length; remaining >= 0; remaining--) {
    const omitted = items.length - selected.length
    const text = [
      header,
      ...selected,
      ...(omitted ? [L({ ko: `외 ${omitted}개`, en: `${omitted} more` })] : []),
    ].join('\n')
    if (estimateTokens(text) <= budget) return text
    if (!selected.length) return null
    selected.pop()
  }
  return null
}

export function buildContinuationPreamble(
  plan: { bareContinuation: boolean; intentRequest: string },
  turns: TurnRecord | readonly TurnRecord[] | undefined,
  request: string,
  workflowActive: boolean,
  lastAssistantText = '',
) {
  const lastTurn: unknown = Array.isArray(turns) ? turns.at(-1) : turns
  const selection =
    plan.bareContinuation &&
    !workflowActive &&
    lastAssistantText.trim() !== '' &&
    isSelectionAnswer(request)
  return {
    reminder: continuationReminder(
      selection,
      request,
      plan,
      workflowActive,
      lastAssistantText,
    ),
    facts:
      plan.bareContinuation && !workflowActive && turns && lastTurn
        ? formatContinuationFacts(turns, request)
        : null,
  }
}

/** Adds the bare-continuation facts and the reminder-prefixed user request. */
export function addContinuationSections(
  assembler: { addSection(section: ContextSection): void },
  plan: {
    bareContinuation: boolean
    intentRequest: string
    referencedPaths?: readonly string[]
    currentTurn?: TurnRecord
  },
  turns: TurnRecord | readonly TurnRecord[] | undefined,
  request: string,
  workflowActive: boolean,
  history: Parameters<typeof lastAssistantText>[0],
  exposedTools: readonly string[] = [],
): void {
  const continuation = buildContinuationPreamble(
    plan,
    turns,
    request,
    workflowActive,
    lastAssistantText(history),
  )
  if (continuation.facts)
    assembler.addSection({
      id: 'continuation_facts',
      content: continuation.facts,
    })
  const referenced = referencedDocumentsFor(plan)
  if (referenced)
    assembler.addSection({ id: 'referenced_documents', content: referenced })
  const profiles = formatStyleProfiles(
    Array.isArray(turns) ? turns : turns ? [turns as TurnRecord] : [],
    exposedTools,
  )
  if (profiles)
    assembler.addSection({ id: 'style_profiles', content: profiles })
  const documentJobs = formatDocumentJobs(
    Array.isArray(turns) ? turns : turns ? [turns as TurnRecord] : [],
    plan.currentTurn,
  )
  if (documentJobs)
    assembler.addSection({ id: 'document_jobs', content: documentJobs })
  assembler.addSection({
    id: 'user_request',
    content: `${continuation.reminder}${request}`,
  })
}
export { isSelectionAnswer } from './continuationSelection'
export { pagedQueryCursors } from './pagedQueryCursors'
