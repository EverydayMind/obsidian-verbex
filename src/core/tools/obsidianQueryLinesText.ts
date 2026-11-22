import { L } from '../../i18n/modelText'
import { estimateTokens } from '../../utils/llm/estimateTokens'

import { ToolResult } from './localToolCommon'
import { LineHit } from './obsidianQueryLinesScan'
import {
  LinesError,
  LinesSession,
  scanComplete,
} from './obsidianQueryLinesSession'

export function linesError(error: LinesError, budget: number): ToolResult {
  const messages: Record<string, string> = {
    terms: L({
      ko: '줄 모드에는 본문 말이나 line_terms가 필요합니다. line_terms는 문자열 배열이며, 공백·빈 값·중복 정리 뒤 1~10개, 각각 100자 이하여야 합니다.',
      en: 'Line mode requires body terms or line_terms. Use a string array with 1–10 terms after trimming and removing empty values and duplicates, each at most 100 characters.',
    }),
    conversation: L({
      ko: '줄 모드에는 대화 ID가 필요합니다.',
      en: 'Line mode requires a conversation ID.',
    }),
    unavailable: L({
      ko: '여기서는 줄 모드 세션을 사용할 수 없습니다.',
      en: 'Line mode sessions are unavailable here.',
    }),
    expired: L({
      ko: '세션 만료. restart: true로 다시 시작하세요.',
      en: 'Session expired. Start again with restart: true.',
    }),
    format: L({
      ko: 'cursor 형식이 맞지 않습니다. 결과에 적힌 cursor를 따옴표 안 그대로 쓰세요.',
      en: 'Invalid cursor format. Use the cursor exactly as shown inside the quotes in the result.',
    }),
    pageExpired: L({
      ko: '페이지 만료. restart: true로 다시 시작하세요.',
      en: 'Page expired. Start again with restart: true.',
    }),
    sequential: L({
      ko: '뒤 페이지를 건너뛸 수 없습니다. 반환된 다음 cursor를 쓰세요.',
      en: 'Cannot skip ahead. Use the returned next cursor.',
    }),
    mismatch: L({
      ko: 'cursor의 대화나 조건이 다릅니다. restart: true로 다시 시작하세요.',
      en: 'Cursor conversation or conditions differ. Start again with restart: true.',
    }),
    invalidated: L({
      ko: '변경 또는 접근 정책 변경으로 세션 무효화. 이전 결과와 합치지 말고 restart: true로 다시 시작하세요.',
      en: 'Session invalidated by a change or access policy change. Do not combine with previous results; start again with restart: true.',
    }),
    targets: L({
      ko: '대상 노트가 20,000개를 넘습니다. query 조건을 좁히세요.',
      en: 'More than 20,000 target notes. Narrow the query.',
    }),
    budget: L({
      ko: '머리말과 줄을 담을 결과 예산이 부족합니다. 문맥 예산을 늘린 뒤 restart: true로 다시 시작하세요.',
      en: 'Result budget cannot hold the header and line. Increase the context budget and start again with restart: true.',
    }),
    aborted: L({
      ko: '줄 수집 중단. restart: true로 다시 시작하세요.',
      en: 'Line collection aborted. Start again with restart: true.',
    }),
  }
  let message = messages[error.code] ?? messages.unavailable
  if (error.path && estimateTokens(`${message}\n${error.path}`) <= budget)
    message += `\n${error.path}`
  if (estimateTokens(message) > budget)
    message = estimateTokens(error.code) <= budget ? error.code : ''
  return { kind: 'error', message, retryAllowed: false }
}

export function renderLine(hit: LineHit): string {
  return `${hit.path} · L${hit.line} · ${hit.heading || '—'}${hit.date ? ` · ${hit.date}` : ''} | ${hit.preview}${hit.truncated ? L({ ko: ` [잘림, 원래 ${hit.length}자; read_note_lines로 전체 줄 확인]`, en: ` [truncated, original ${hit.length} characters; read_note_lines for the full line]` }) : ''}`
}

export function linesHeader(
  s: LinesSession,
  count: number,
  cursor: string,
  reserve = false,
): string {
  const n = (value: number) => (reserve ? Number.MAX_SAFE_INTEGER : value)
  const complete = scanComplete(s) && !s.pending
  return L({
    ko: `줄 조회(queryId=${s.queryId}, invalidated=false): 대상 ${n(s.targets.length)}개, 훑음 ${n(s.notesScanned)}개, 일치 노트 ${n(s.notesMatched)}개; 이번 ${n(count)}줄, 누적 ${n(s.delivered + count)}줄. 스캔 완료=${String(scanComplete(s))}, 전달 완료=${String(complete)}, 다음 cursor=${cursor ? `'${cursor}'` : '없음'}. noLineMatch=${n(s.noLineMatch.length)}, skippedFiles=${n(s.skippedFiles.length)}, previewTruncated=${n(s.previewTruncated)}. max_lines=${s.maxLines} 고정(다른 요청값 무시). 변경 감지는 파일 시각·크기 기준. 완료는 고정 대상과 이 도구 결과에 실린 줄까지이며 미리보기 내용 완전성과 별개입니다. 경로 목록은 각 최대 20개, 예산 내 일부입니다.`,
    en: `Line query(queryId=${s.queryId}, invalidated=false): targets ${n(s.targets.length)}, scanned ${n(s.notesScanned)}, matched notes ${n(s.notesMatched)}; this page ${n(count)} lines, cumulative ${n(s.delivered + count)}. scanComplete=${String(scanComplete(s))}, deliveryComplete=${String(complete)}, next cursor=${cursor ? `'${cursor}'` : 'none'}. noLineMatch=${n(s.noLineMatch.length)}, skippedFiles=${n(s.skippedFiles.length)}, previewTruncated=${n(s.previewTruncated)}. max_lines=${s.maxLines} fixed (different requested values ignored). Changes detected by file time and size. Completion covers the fixed targets and lines in these tool results; preview content completeness is separate. Path lists show up to 20 each, within budget.`,
  })
}

export function linesPageText(
  s: LinesSession,
  rows: LineHit[],
  cursor: string,
  budget: number,
  reserve = false,
): string {
  const n = (value: number) => (reserve ? Number.MAX_SAFE_INTEGER : value)
  const warning = cursor
    ? L({
        ko: `⚠ 아직 일부입니다: 대상 노트 ${n(s.targets.length)}개 중 ${n(s.notesScanned)}개를 훑었고 남은 줄이 있습니다. 결과는 Obsidian이 반환한 노트 순서로 나오며 날짜순이 보장되지 않습니다. 빠짐없이 모으는 요청이면 답하거나 다른 노트를 읽기 전에 cursor: '${cursor}'로 이어 부르세요(검색어는 다시 보내지 않아도 됩니다). 전달 완료=true가 될 때까지는 답을 쓰거나 노트를 읽지 말고 이어 받기만 하세요. 끝까지 받은 뒤 한 번에 정리합니다.`,
        en: `⚠ Partial result: scanned ${n(s.notesScanned)} of ${n(s.targets.length)} target notes and more lines remain. Results follow the note order returned by Obsidian, which is not guaranteed to be chronological. For requests to collect everything, continue with cursor: '${cursor}' before answering or reading other notes (no need to resend the terms). Until deliveryComplete=true, do not answer or read notes; only continue. Summarize once after receiving everything.`,
      })
    : ''
  let text = [
    ...(warning ? [warning] : []),
    linesHeader(s, rows.length, cursor, reserve),
    ...rows.map(renderLine),
  ].join('\n')
  const details = [
    ...s.noLineMatch.slice(0, 20).map((path) => `noLineMatch: ${path}`),
    ...s.skippedFiles.slice(0, 20).map(({ path, reason }) =>
      L({
        ko: `건너뜀: ${path} (${reason === 'size' ? '2MB 초과' : '읽기 실패'})`,
        en: `Skipped: ${path} (${reason === 'size' ? 'over 2MB' : 'read failed'})`,
      }),
    ),
  ]
  for (const detail of details) {
    if (estimateTokens(`${text}\n${detail}`) > budget) break
    text += `\n${detail}`
  }
  return text
}
