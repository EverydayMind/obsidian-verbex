import type { DocumentReadFact } from '../core/large-document/documentReadProgress'
import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import { L } from '../i18n/modelText'

import type { TurnRecord } from './turnLedger'

/** Merge only retained, delivered ranges of the same provider/source/revision/scope. */
export function documentReadSummaries(
  turns: readonly TurnRecord[],
  audience: 'model' | 'ui' = 'model',
): string[] {
  const groups = new Map<
    string,
    {
      fact: DocumentReadFact
      spans: [number, number][]
      lastUnavailable: boolean
    }
  >()
  for (const turn of turns) {
    if (turn.documentReadsDropped) groups.clear()
    for (const fact of turn.documentReads ?? []) {
      if (fact.state === 'invalidated') {
        const target = fact.path.normalize('NFC').toLowerCase()
        for (const [path, group] of groups)
          if (path.normalize('NFC').toLowerCase() === target)
            groups.set(path, {
              ...group,
              fact: { path, state: 'invalidated' },
              spans: [],
              lastUnavailable: false,
            })
      }
      const old = groups.get(fact.path)
      const page = fact.page
      const same =
        page &&
        old?.fact.page &&
        fact.provider === old.fact.provider &&
        page.identity === old.fact.page.identity &&
        page.total === old.fact.page.total &&
        page.unit === old.fact.page.unit &&
        page.scope === old.fact.page.scope
      // A failed delivery adds nothing but does not erase ranges already delivered.
      if (fact.state === 'unavailable' && old && (!page || same)) {
        old.lastUnavailable = true
        continue
      }
      const spans: [number, number][] =
        same && old.fact.state === 'page' && fact.state === 'page'
          ? old.spans
          : []
      if (fact.state === 'page' && page?.contentComplete && page.total > 0)
        spans.push([page.from, page.to])
      groups.set(fact.path, {
        fact,
        spans,
        lastUnavailable: fact.state === 'unavailable',
      })
    }
  }
  return [...groups].map(([path, { fact, spans, lastUnavailable }]) => {
    const page = fact.page
    if (fact.state === 'unavailable')
      return L({
        ko: `읽기 범위: ${path} — 읽기 결과 미확인; 새로 조회 필요`,
        en: `Read coverage: ${path} — read result unconfirmed; query again`,
      })
    if (!page || fact.state === 'unknown' || fact.state === 'invalidated')
      return L({
        ko: `읽기 범위: ${path} — ${fact.state === 'invalidated' ? (audience === 'ui' ? '읽은 뒤 파일이 바뀌어 앞서 읽은 내용은 최신이 아닙니다' : '읽기 범위 무효화; 재확인 필요') : '전체 범위 미확인'}`,
        en: `Read coverage: ${path} — ${fact.state === 'invalidated' ? (audience === 'ui' ? 'the file changed after it was read, so the earlier read is out of date' : 'read coverage invalidated; recheck required') : 'full coverage unconfirmed'}`,
      })
    let count = 0,
      end = 0,
      firstGap = 1
    for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
      if (from <= firstGap) firstGap = Math.max(firstGap, to + 1)
      count += Math.max(0, to - Math.max(end, from - 1))
      end = Math.max(end, to)
    }
    const complete =
      count === page.total && (page.total > 0 || fact.state === 'page')
    const lastWarning = lastUnavailable
      ? L({
          ko: '; 최근 읽기 미확인, 새로 조회 필요',
          en: `; latest read unconfirmed, query again`,
        })
      : ''
    const incomplete = lastUnavailable
      ? L({
          ko: `일부만 확인; 미확인 시작=${firstGap}${lastWarning}`,
          en: `Partially confirmed; first unconfirmed=${firstGap}${lastWarning}`,
        })
      : L({
          ko: `일부만 확인; 미확인 시작=${firstGap}. 직전 도구의 유효한 cursor로 이어 읽고, 만료 시 다시 탐색`,
          en: `Partially confirmed; first unconfirmed=${firstGap}. Continue with the previous tool's valid cursor; rediscover if expired`,
        })
    return L({
      ko: `읽기 범위: ${path} — ${page.scope === 'body-blocks' ? '본문 블록' : '문서'} ${count}/${page.total} ${page.unit}, ${complete ? `해당 범위 전달 완료 (내용·서식 검증과 별도)${lastWarning}` : incomplete}`,
      en: `Read coverage: ${path} — ${page.scope === 'body-blocks' ? 'body blocks' : 'document'} ${count}/${page.total} ${page.unit}, ${complete ? `range delivery complete (separate from content/format validation)${lastWarning}` : incomplete}`,
    })
  })
}

export function recordDocumentRead(
  record: TurnRecord,
  fact: DocumentReadFact,
): void {
  const reads = (record.documentReads ??= [])
  reads.push(fact)
  if (reads.length > 256) {
    reads.shift()
    record.documentReadsDropped = true
  }
}

export function recordOutcomeRead(
  record: TurnRecord,
  outcome: AgentToolOutcome,
  path?: string,
): void {
  if (outcome.privateTranscript) return
  if (outcome.documentRead) recordDocumentRead(record, outcome.documentRead)
  if (outcome.invalidatedReadTarget)
    recordDocumentRead(record, {
      path: outcome.invalidatedReadTarget,
      state: 'invalidated',
    })
  const paths = outcome.commit
    ? outcome.commit.entries
        .filter((entry) =>
          ['written', 'unknown', 'pending'].includes(entry.state),
        )
        .map((entry) => entry.path)
    : outcome.mutation !== 'none' && path
      ? [path]
      : []
  for (const path of paths)
    recordDocumentRead(record, { path, state: 'invalidated' })
}
