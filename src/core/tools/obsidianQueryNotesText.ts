import { L } from '../../i18n/modelText'
import { estimateTokens } from '../../utils/llm/estimateTokens'

import { ToolResult } from './localToolCommon'
import {
  LinesError,
  NoteHit,
  NotesSession,
  scanComplete,
} from './obsidianQueryLinesSession'
import { linesError } from './obsidianQueryLinesText'

export function notesError(error: LinesError, budget: number): ToolResult {
  const messages: Record<string, string> = {
    conversation: L({
      ko: '노트 모드에는 대화 ID가 필요합니다.',
      en: 'Note mode requires a conversation ID.',
    }),
    unavailable: L({
      ko: '여기서는 노트 모드 세션을 사용할 수 없습니다.',
      en: 'Note mode sessions are unavailable here.',
    }),
    pageExpired: L({
      ko: '페이지 만료. 쪽 캐시 20개 밖의 옛 쪽은 재생할 수 없습니다. restart: true로 다시 시작하세요.',
      en: 'Page expired. Old pages outside the 20-page cache cannot be replayed. Start again with restart: true.',
    }),
    aborted: L({
      ko: '노트 수집 중단. restart: true로 다시 시작하세요.',
      en: 'Note collection aborted. Start again with restart: true.',
    }),
    budget: L({
      ko: '머리말과 노트를 담을 결과 예산이 부족합니다. 문맥 예산을 늘린 뒤 restart: true로 다시 시작하세요.',
      en: 'Result budget cannot hold the header and note. Increase the context budget and start again with restart: true.',
    }),
  }
  const message = messages[error.code]
  return message
    ? {
        kind: 'error',
        message:
          estimateTokens(message) <= budget
            ? message
            : estimateTokens(error.code) <= budget
              ? error.code
              : '',
        retryAllowed: false,
      }
    : linesError(error, budget)
}

export function renderNote(hit: NoteHit): string {
  return `${hit.path}${hit.date ? ` · ${hit.date}` : ''} · ${L({ ko: `일치한 질의 낱말 ${hit.score}개`, en: `${hit.score} query terms matched` })} · ${hit.line === null ? L({ ko: '본문 줄 없음', en: 'no body line' }) : `L${hit.line}`} | ${hit.preview}${hit.truncated ? L({ ko: ' [미리보기 잘림]', en: ' [preview truncated]' }) : ''}`
}

export function notesPageText(
  s: NotesSession,
  rows: NoteHit[],
  cursor: string,
  budget: number,
  reserve = false,
): string {
  const n = (value: number) => (reserve ? Number.MAX_SAFE_INTEGER : value)
  const complete = scanComplete(s) && !s.pending && s.invalidated === undefined
  const total =
    scanComplete(s) && !s.skippedFiles.length && s.invalidated === undefined
      ? L({
          ko: `총 ${n(s.notesMatched)}개`,
          en: `total ${n(s.notesMatched)} notes`,
        })
      : L({
          ko: `확인된 일치 ${n(s.notesMatched)}개, 확인하지 못한 노트 ${n(s.targets.length - s.notesChecked)}개`,
          en: `confirmed matches ${n(s.notesMatched)}, unchecked notes ${n(s.targets.length - s.notesChecked)}`,
        })
  const warning = cursor
    ? L({
        ko: `⚠ 아직 일부입니다: 대상 노트 ${n(s.targets.length)}개 중 ${n(s.notesScanned)}개를 훑었고 남은 노트가 있습니다. 결과는 Obsidian이 반환한 노트 순서로 나오며 날짜순이 보장되지 않습니다. 빠짐없이 모으는 요청이면 답하거나 다른 노트를 읽기 전에 cursor: '${cursor}'로 이어 부르세요(검색어는 다시 보내지 않아도 됩니다). 전달 완료=true가 될 때까지는 답을 쓰거나 노트를 읽지 말고 이어 받기만 하세요. 끝까지 받은 뒤 한 번에 정리합니다.`,
        en: `⚠ Partial result: scanned ${n(s.notesScanned)} of ${n(s.targets.length)} target notes and more notes remain. Results follow the note order returned by Obsidian, which is not guaranteed to be chronological. For requests to collect everything, continue with cursor: '${cursor}' before answering or reading other notes (no need to resend the terms). Until deliveryComplete=true, do not answer or read notes; only continue. Summarize once after receiving everything.`,
      })
    : ''
  const header = L({
    ko: `노트 조회(queryId=${s.queryId}, invalidated=${String(s.invalidated !== undefined)}): ${total}; 대상 ${n(s.targets.length)}개, 훑음 ${n(s.notesScanned)}개, 판정 ${n(s.notesChecked)}개; 이번 ${n(rows.length)}개, 누적 ${n(s.delivered + rows.length)}개. 스캔 완료=${String(scanComplete(s))}, 전달 완료=${String(complete)}, 다음 cursor=${cursor ? `'${cursor}'` : '없음'}. skippedFiles=${n(s.skippedFiles.length)}, previewTruncated=${n(s.previewTruncated)}. max_notes=${s.maxNotes} 고정(다른 요청값 무시). 노트 일치 조건(본문만이 아님): 경로·파일명·본문·frontmatter·태그·별칭. getMarkdownFiles() 순서(날짜순 아님). 변경 감지는 파일 시각·크기 기준. 완료는 고정 대상과 전달된 노트까지이며 미리보기 내용 완전성과 별개입니다.`,
    en: `Note query(queryId=${s.queryId}, invalidated=${String(s.invalidated !== undefined)}): ${total}; targets ${n(s.targets.length)}, scanned ${n(s.notesScanned)}, checked ${n(s.notesChecked)}; this page ${n(rows.length)}, cumulative ${n(s.delivered + rows.length)}. scanComplete=${String(scanComplete(s))}, deliveryComplete=${String(complete)}, next cursor=${cursor ? `'${cursor}'` : 'none'}. skippedFiles=${n(s.skippedFiles.length)}, previewTruncated=${n(s.previewTruncated)}. max_notes=${s.maxNotes} fixed (different requested values ignored). Note matching (not body-only): path, filename, body, frontmatter, tags and aliases. getMarkdownFiles() order (not chronological). Changes detected by file time and size. Completion covers fixed targets and delivered notes; preview content completeness is separate.`,
  })
  let text = [warning, header, ...rows.map(renderNote)]
    .filter(Boolean)
    .join('\n')
  for (const { path, reason } of s.skippedFiles.slice(0, 20)) {
    const detail = L({
      ko: `건너뜀: ${path} (${reason === 'size' ? '2MB 초과' : '읽기 실패'})`,
      en: `Skipped: ${path} (${reason === 'size' ? 'over 2MB' : 'read failed'})`,
    })
    if (estimateTokens(`${text}\n${detail}`) > budget) break
    text += `\n${detail}`
  }
  return text
}
