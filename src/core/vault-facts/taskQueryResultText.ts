import { L } from '../../i18n/modelText'

export function nextPage(p0: string | number) {
  return L({
    ko: `
다음 쪽: offset=${p0}`,
    en: `
Next page: offset=${p0}`,
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
  p4: string | number,
) {
  return L({
    ko: `${p0}범위: ${p1} — ${p2}개 노트 중 할 일 ${p3}개, 노트 ${p4}개.`,
    en: `${p0}Scope: ${p1} — ${p3} tasks in ${p4} notes out of ${p2} notes.`,
  })
}

export function aborted() {
  return L({ ko: `작업이 중단되었습니다.`, en: `The operation was aborted.` })
}
