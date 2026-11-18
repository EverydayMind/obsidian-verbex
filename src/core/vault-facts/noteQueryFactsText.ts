import { L } from '../../i18n/modelText'

export function taskCounts(p0: string | number, p1: string | number) {
  return L({
    ko: `
노트별 할 일 수(상위 10 / 노트 ${p0}개):${p1}`,
    en: `
Task counts by note (top 10 / ${p0} notes):${p1}`,
  })
}

export function tie(p0: string | number, p1: string | number) {
  return L({
    ko: `
정렬 값이 ${p0}으로 같은 노트가 이 쪽 뒤에 ${p1}개 더 있음(같은 값 안에서는 경로순)`,
    en: `
${p1} more notes after this page share the sort value ${p0} (ordered by path within equal values)`,
  })
}

export function noValue() {
  return L({ ko: `(값 없음)`, en: `(no value)` })
}

export function missingProperty(p0: string | number, p1: string | number) {
  return L({
    ko: `속성 '${p0}'을 가진 노트가 범위에 없음.${p1}`,
    en: `No notes in scope have property '${p0}'.${p1}`,
  })
}

export function missingSortProperty(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `속성 '${p0}': 범위 노트 ${p1}개 중 이 속성을 가진 노트가 없음. ${p2}`,
    en: `Property '${p0}': none of the ${p1} notes in scope have this property. ${p2}`,
  })
}

export function reserved(p0: string | number) {
  return L({ ko: `예약 필드: ${p0}.`, en: `Reserved fields: ${p0}.` })
}

export function hint(p0: string | number) {
  return L({
    ko: `file.${p0}을 뜻했다면 그렇게 쓸 것.`,
    en: `If you meant file.${p0}, use that field name.`,
  })
}

export function whereHint(field: string) {
  return L({
    ko: `where의 field를 "file.${field}"로 쓰${field === 'folder' ? '거나 folder 인자를 쓰세요.' : '세요.'}`,
    en: `Use "file.${field}" as the where field${field === 'folder' ? ' or use the folder argument' : ''}.`,
  })
}
