import { L } from '../../i18n/modelText'

export function aborted() {
  return L({ ko: `작업이 중단되었습니다.`, en: `The operation was aborted.` })
}

export function nextPage(p0: string | number) {
  return L({
    ko: `
다음 쪽: offset=${p0}`,
    en: `
Next page: offset=${p0}`,
  })
}

export function all() {
  return L({ ko: `전체`, en: `all` })
}

export function unresolved(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
  p4: string | number,
) {
  return L({
    ko: `범위: ${p0} — 없는 대상 ${p1}개, 링크 ${p2}개, 출발 노트 ${p3}개. 링크 색인이 없는 노트 ${p4}개.`,
    en: `Scope: ${p0} — ${p1} missing targets, ${p2} links, ${p3} source notes. ${p4} notes have no link index.`,
  })
}

export function row(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0} → ${p1} (${p2}회)`,
    en: `${p0} → ${p1} (${p2} occurrences)`,
  })
}

export function orphans(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
  p4: string | number,
) {
  return L({
    ko: `다른 노트에서 들어오는 링크가 없는 Markdown 노트. 범위: ${p0} — 전체 노트 ${p1}개, 해당 ${p2}개, 그중 나가는 링크도 없는 노트 ${p3}개. 링크 색인이 없는 노트 ${p4}개.`,
    en: `Markdown notes with no incoming links from other notes. Scope: ${p0} — ${p1} total notes, ${p2} matching notes, of which ${p3} also have no outgoing links. ${p4} notes have no link index.`,
  })
}

export function integerError(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0}는 ${p1}~${p2} 정수여야 합니다.`,
    en: `${p0} must be an integer from ${p1} to ${p2}.`,
  })
}

export function folderError() {
  return L({
    ko: `folder는 폴더 경로 문자열이어야 합니다.`,
    en: `folder must be a folder path string.`,
  })
}

export function kindError() {
  return L({
    ko: `kind는 unresolved 또는 orphans여야 합니다.`,
    en: `kind must be unresolved or orphans.`,
  })
}

export function unknownArgument(p0: string | number) {
  return L({
    ko: `알 수 없는 인자: ${p0}. 허용: kind, folder, limit, offset`,
    en: `Unknown argument: ${p0}. Allowed: kind, folder, limit, offset`,
  })
}
