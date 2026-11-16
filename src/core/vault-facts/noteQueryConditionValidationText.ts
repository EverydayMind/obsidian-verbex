import { L } from '../../i18n/modelText'

export function textCountError() {
  return L({
    ko: `text_count는 text와 함께 쓴다.`,
    en: `Use text_count together with text.`,
  })
}

export function unknownField(p0: string | number, p1: string | number) {
  return L({
    ko: `알 수 없는 필드 ${p0}. 허용 필드: ${p1}`,
    en: `Unknown field ${p0}. Allowed fields: ${p1}`,
  })
}

export function valueError(p0: string | number) {
  return L({
    ko: `${p0}: value는 문자열이어야 합니다. 수와 날짜도 문자열로 주세요.`,
    en: `${p0}: value must be a string. Supply numbers and dates as strings too.`,
  })
}

export function unknownOp(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `${p0}: 알 수 없는 op ${p1}. 허용 값: ${p2}`,
    en: `${p0}: unknown op ${p1}. Allowed values: ${p2}`,
  })
}

export function missingField(p0: string | number) {
  return L({
    ko: `${p0}: field가 누락되었습니다.`,
    en: `${p0}: field is missing.`,
  })
}

export function unknownKey(p0: string | number, p1: string | number) {
  return L({
    ko: `${p0}: 알 수 없는 키 ${p1}. 허용 키: field, op, value`,
    en: `${p0}: unknown key ${p1}. Allowed keys: field, op, value`,
  })
}

export function objectError(p0: string | number) {
  return L({ ko: `${p0}은 객체여야 합니다.`, en: `${p0} must be an object.` })
}

export function condition(p0: string | number) {
  return L({ ko: `where ${p0}번째 조건`, en: `where condition ${p0}` })
}
