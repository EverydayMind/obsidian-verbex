import { L } from '../../i18n/modelText'

import { round } from './calculateErrors'
export function endMarker() {
  return L({ ko: '끝', en: 'end' })
}

export function parseFailure(message: string, pos: number, char: string) {
  return L({
    ko: `${message} 위치 ${pos}, 글자 '${char}'.`,
    en: `${message} Position ${pos}, character '${char}'.`,
  })
}

export function thousandsError() {
  return L({
    ko: '남은 글자가 있습니다. 숫자 안의 천 단위 쉼표는 쓸 수 없음',
    en: 'Unexpected trailing characters. Thousands separators are not allowed in numbers',
  })
}

export function trailingError() {
  return L({
    ko: '식 뒤에 남은 글자가 있습니다',
    en: 'Unexpected trailing characters after the expression',
  })
}

export function nonfiniteError() {
  return L({ ko: '유한하지 않은 결과입니다.', en: 'The result is not finite.' })
}

export function zeroDivisorError() {
  return L({ ko: '0으로 나눌 수 없습니다.', en: 'Cannot divide by zero.' })
}

export function unclosedError() {
  return L({ ko: '괄호가 닫히지 않았습니다', en: 'Unclosed parentheses' })
}

export function expectedValueError() {
  return L({
    ko: '수 또는 함수를 기대했습니다',
    en: 'Expected a number or function',
  })
}

export function functionParenError() {
  return L({
    ko: '함수 괄호가 필요합니다',
    en: 'Function parentheses are required',
  })
}

export function unclosedFunctionError() {
  return L({
    ko: '함수 괄호가 닫히지 않았습니다',
    en: 'Unclosed function parentheses',
  })
}

export function displayValue(value: number) {
  return L({
    ko: ` (표시용: ${round(value, 2)})`,
    en: ` (display: ${round(value, 2)})`,
  })
}

export function precisionLimit() {
  return L({ ko: ' (정밀도 한계)', en: ' (precision limit)' })
}
