import { L } from '../../i18n/modelText'

export function rangeError(p0: string | number, p1: string | number) {
  return L({ ko: `${p0} 범위: ${p1}`, en: `${p0} range: ${p1}` })
}

export function fieldsError() {
  return L({
    ko: `fields는 최대 6개 문자열이어야 합니다.`,
    en: `fields must contain at most 6 strings.`,
  })
}

export function whereError() {
  return L({
    ko: `where는 최대 8개 조건이어야 합니다.`,
    en: `where must contain at most 8 conditions.`,
  })
}

export function allowedValues(p0: string | number, p1: string | number) {
  return L({ ko: `${p0} 허용 값: ${p1}`, en: `${p0} allowed values: ${p1}` })
}

export function pathConflict() {
  return L({
    ko: `folder와 path는 함께 쓸 수 없습니다.`,
    en: `folder and path cannot be used together.`,
  })
}

export function textError() {
  return L({
    ko: `text는 200자 이하여야 합니다.`,
    en: `text must be at most 200 characters.`,
  })
}

export function stringError(p0: string | number) {
  return L({
    ko: `${p0}는 빈 값이 아닌 문자열이어야 합니다.`,
    en: `${p0} must be a nonempty string.`,
  })
}

export function unknownArgument(p0: string | number, p1: string | number) {
  return L({
    ko: `알 수 없는 인자: ${p0}. 허용 인자: ${p1}`,
    en: `Unknown argument: ${p0}. Allowed arguments: ${p1}`,
  })
}
