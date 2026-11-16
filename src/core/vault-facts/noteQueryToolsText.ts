import { L } from '../../i18n/modelText'

export function queryError() {
  return L({ ko: `조회 오류`, en: `Query error` })
}

export function nextPage(p0: string | number) {
  return L({
    ko: `
다음 쪽: offset=${p0}`,
    en: `
Next page: offset=${p0}`,
  })
}

export function noValue() {
  return L({ ko: `(값 없음)`, en: `(no value)` })
}

export function page(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
) {
  return L({
    ko: `
노트 ${p0}부터 (전체 ${p1}, ${p2} ${p3}):`,
    en: `
Notes starting at ${p0} (total ${p1}, ${p2} ${p3}):`,
  })
}

export function allGroups(p0: string | number) {
  return L({ ko: `묶음 ${p0}개(전부 표시)`, en: `${p0} groups (all shown)` })
}

export function partialGroups(p0: string | number, p1: string | number) {
  return L({
    ko: `묶음 ${p0}개 중 ${p1}개 표시`,
    en: `Showing ${p1} of ${p0} groups`,
  })
}

export function groupCounts(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
) {
  return L({
    ko: `
${p0}${p1}별 노트 수 — ${p2}. 목록 값은 여러 묶음에 셀 수 있습니다.${p3}`,
    en: `
Note counts by ${p0}${p1} — ${p2}. List values may be counted in multiple groups.${p3}`,
  })
}

export function taskTotals(p0: string | number, p1: string | number) {
  return L({
    ko: `
할 일 합계: open ${p0}, done ${p1}.`,
    en: `
Task totals: open ${p0}, done ${p1}.`,
  })
}

export function occurrences(p0: string | number, p1: string | number) {
  return L({
    ko: `
"${p0}" 본문 출현 합계: ${p1}회.`,
    en: `
Total body occurrences of "${p0}": ${p1}.`,
  })
}

export function unindexed(p0: string | number) {
  return L({
    ko: `색인되지 않은 노트: ${p0}개. `,
    en: `Unindexed notes: ${p0}. `,
  })
}

export function all() {
  return L({ ko: `전체`, en: `all` })
}

export function scope(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
) {
  return L({
    ko: `${p0}범위: ${p1} — 노트 ${p2}개를 검사함. 조건에 맞는 노트: ${p3}개.
노트 수와 묶음 수는 전체 조건에 대한 값입니다.`,
    en: `${p0}Scope: ${p1} — ${p2} notes inspected. Matching notes: ${p3}.
Note and group counts cover all matching results.`,
  })
}

export function budget(p0: string | number, p1: string | number) {
  return L({
    ko: `계산하지 않음: 대상 노트 ${p0}개, 크기 ${p1}MB. 한도 3,000개·20MB. folder나 where로 좁힐 것`,
    en: `Not calculated: ${p0} target notes, ${p1}MB. Limit: 3,000 notes / 20MB. Narrow the scope with folder or where`,
  })
}

export function textCountError() {
  return L({
    ko: `text_count 조건에는 query_notes의 text가 필요합니다.`,
    en: `A text_count condition requires text in query_notes.`,
  })
}

export function notFound(p0: string | number) {
  return L({ ko: `노트를 찾을 수 없음: ${p0}`, en: `Note not found: ${p0}` })
}

export function aborted() {
  return L({ ko: `작업이 중단되었습니다.`, en: `The operation was aborted.` })
}
