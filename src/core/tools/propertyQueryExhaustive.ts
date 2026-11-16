import { L } from '../../i18n/modelText'
import { estimateTokens } from '../../utils/llm/estimateTokens'

import { ToolExecutionContext, ToolResult, str } from './localToolCommon'
import {
  PropertyQuerySpec,
  distribution,
  filterLine,
  fmValue,
  matchProperty,
  show,
} from './propertyMatch'
import {
  accessPolicyFingerprint,
  conditionText,
  firstUnseen,
  lowerSorted,
  queryIdentity,
  stale,
} from './propertyQueryCursor'
import { renderRow, signature } from './propertyQueryExhaustiveText'
import {
  CoverageState,
  PROPERTY_QUERY_LIMITS,
  PropertyQuerySession,
  PropertyQuerySessionStore,
  SnapshotRow,
} from './propertyQuerySession'

function openSession(
  store: PropertyQuerySessionStore,
  spec: PropertyQuerySpec,
  ctx: ToolExecutionContext,
  identity: string,
  policy: string,
): PropertyQuerySession | ToolResult {
  const { matched, matches } = matchProperty(spec, ctx.app)
  if (matches.length > PROPERTY_QUERY_LIMITS.maxRows)
    return {
      kind: 'read',
      facts: {
        completeness: 'unsupported',
        errorCode: 'limit',
        total: matches.length,
      },
      text: L({
        ko: `전수 snapshot 한도 초과: 조건 일치 ${matches.length}개 > ${PROPERTY_QUERY_LIMITS.maxRows}개. filter_field·include_values로 범위를 좁히거나 exhaustive 없이 페이지 조회를 쓰세요.`,
        en: `Exhaustive snapshot limit exceeded: ${matches.length} matches > ${PROPERTY_QUERY_LIMITS.maxRows}. Narrow the scope with filter_field/include_values or use paginated queries without exhaustive.`,
      }),
    }
  const rows: SnapshotRow[] = matches.map(({ file, fm, actual }) => ({
    path: file.path,
    actual,
    signature: signature(spec, fm),
    projected: Object.fromEntries(spec.fields.map((f) => [f, fmValue(fm, f)])),
  }))
  return store.start({
    conversationId: ctx.conversationId ?? '',
    identity,
    policy,
    rows,
    prop: spec.prop,
    fields: spec.fields,
    condition: conditionText(spec),
    distribution:
      filterLine(spec, matches.length, matched.length) +
      spec.fields.map((f) => `\n${distribution(matched, f)}`).join(''),
  })
}

type Stop = 'budget' | 'limit' | 'aborted' | undefined

/**
 * Explicit `offset` reads one page of the snapshot (idempotent). Without it
 * the host walks unseen rows page by page, checking abort, time, page and
 * token budget before each page.
 */
export function queryPropertyExhaustive(
  spec: PropertyQuerySpec,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): ToolResult {
  const store = ctx.propertyQuerySessions
  if (!store)
    return {
      kind: 'error',
      message: 'find_by_property: exhaustive mode is unavailable here.',
    }
  const identity = queryIdentity(spec)
  const policy = accessPolicyFingerprint(ctx)
  const cursorArg = str(args, 'cursor')
  const conversationId = ctx.conversationId ?? ''
  let session: PropertyQuerySession
  let resumed = false
  if (cursorArg) {
    const found = store.lookup(cursorArg, conversationId, identity, policy)
    if (!found.ok) return stale(cursorArg, found.state, found.condition)
    session = found.session
  } else {
    // A dropped cursor resumes the live unfinished snapshot; only an explicit
    // restart opens a new one (v1.1).
    const open =
      args.restart === true
        ? undefined
        : store.findOpen(conversationId, identity, policy)
    resumed = open !== undefined
    const opened = open ?? openSession(store, spec, ctx, identity, policy)
    if ('kind' in opened) return opened
    session = opened
  }
  const requestedFields = spec.fields
  spec = { ...spec, fields: [...session.fields] }
  const projectionNote =
    show(lowerSorted(requestedFields)) === show(lowerSorted(spec.fields))
      ? ''
      : L({
          ko: `
표시 열은 snapshot을 만들 때의 fields ${show(spec.fields)}를 씁니다(요청 ${show(requestedFields)} 무시). 다른 열이 필요하면 restart=true로 새로 시작하세요.`,
          en: `\nDisplayed columns use the fields ${show(spec.fields)} from snapshot creation (requested ${show(requestedFields)} ignored). To use other columns, start again with restart=true.`,
        })
  const total = session.rows.length
  const budget = Math.max(500, Math.floor(ctx.getContextBudget() * 0.5))
  const deadline = Date.now() + PROPERTY_QUERY_LIMITS.maxCallMs
  const explicit = spec.offset !== undefined
  const start = Math.min(spec.offset ?? 0, total)
  const lines: string[] = []
  const paths: string[] = []
  let tokens = 0
  let pages = 0
  let stop: Stop
  let at = explicit ? start : (firstUnseen(session) ?? total)
  while (at < total) {
    if (ctx.signal?.aborted) {
      stop = 'aborted'
      break
    }
    if (
      pages >= (explicit ? 1 : PROPERTY_QUERY_LIMITS.maxPagesPerCall) ||
      (pages && Date.now() > deadline)
    ) {
      stop = explicit ? undefined : 'limit'
      break
    }
    const end = Math.min(total, at + spec.limit)
    let i = at
    for (; i < end; i++) {
      const line = renderRow(spec, ctx, session.rows[i], i)
      const cost = estimateTokens(line)
      if (lines.length && tokens + cost > budget) {
        stop = 'budget'
        break
      }
      lines.push(line)
      paths.push(session.rows[i].path)
      tokens += cost
    }
    store.markSeen(session, at, i)
    pages++
    if (stop) break
    at = explicit ? total : (firstUnseen(session, i) ?? total)
  }
  const next = firstUnseen(session)
  const state: CoverageState =
    session.seenCount === total
      ? 'complete'
      : stop === 'aborted'
        ? 'interrupted'
        : 'partial'
  const coverage = {
    cursor: session.cursor,
    state,
    seen: session.seenCount,
    total,
  }
  const label = L({
    ko:
      state === 'complete' ? '완료' : state === 'partial' ? '미완료' : '중단됨',
    en:
      state === 'complete'
        ? 'complete'
        : state === 'partial'
          ? 'incomplete'
          : 'interrupted',
  })
  return {
    kind: 'read',
    evidencePaths: paths,
    facts: {
      completeness: stop ? 'partial' : total ? 'complete' : 'empty',
      total,
      returned: lines.length,
      ...(next !== undefined ? { nextOffset: next } : {}),
      ...(stop ? { errorCode: stop } : {}),
      coverage,
    },
    text: L({
      ko: `Property ${spec.prop}=${show(spec.value)} 전수 조회 — cursor=${session.cursor}, snapshot 시점 ${total}개 고정${resumed ? ' (cursor 없이 호출해 같은 조건의 미완료 snapshot을 이어감, 새로 시작하려면 restart=true)' : ''}${projectionNote}\ncoverage ${session.seenCount}/${total} (host 판정: ${label}); 이번 호출 ${lines.length}행·${pages} page${stop ? ` (${stop === 'budget' ? '응답 예산' : stop === 'limit' ? '호출당 page·시간 한도' : '사용자 중단'}에서 멈춤)` : ''}${session.distribution}\n${next !== undefined ? `미확인 ${total - session.seenCount}개 남음: 같은 조건에 exhaustive=true, cursor="${session.cursor}"로 다시 호출하면 host가 미확인 행부터 이어서 순회합니다. coverage가 완료되기 전에는 "모두/최종"이라고 답하지 마세요.` : 'snapshot의 모든 행을 반환했습니다. 이후 변경은 행별로 표시합니다.'}\n긴 목록은 답변에 행을 옮겨 적지 말고 export_property_query(cursor="${session.cursor}")로 snapshot 전체를 노트로 저장하세요(다시 조회할 필요 없음).\n${lines.join('\n')}`,
      en: `Property ${spec.prop}=${show(spec.value)} exhaustive query — cursor=${session.cursor}, ${total} rows fixed at snapshot time${resumed ? ' (called without a cursor; resuming the unfinished snapshot for the same condition; use restart=true to start again)' : ''}${projectionNote}\ncoverage ${session.seenCount}/${total} (host assessment: ${label}); this call ${lines.length} rows · ${pages} pages${stop ? ` (stopped at ${stop === 'budget' ? 'response budget' : stop === 'limit' ? 'per-call page/time limit' : 'user interruption'})` : ''}${session.distribution}\n${next !== undefined ? `${total - session.seenCount} unseen rows remain: call again with the same condition, exhaustive=true and cursor="${session.cursor}"; the host will continue from unseen rows. Do not describe results as "all/final" before coverage is complete.` : 'All snapshot rows have been returned. Subsequent changes are marked per row.'}\nFor long lists, save the entire snapshot to a note with export_property_query(cursor="${session.cursor}") instead of copying rows into the answer (no new query needed).\n${lines.join('\n')}`,
    }),
  }
}
