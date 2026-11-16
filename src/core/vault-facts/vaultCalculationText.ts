import { L } from '../../i18n/modelText'

export function calculationAborted() {
  return L({ ko: '작업이 중단되었습니다.', en: 'Operation aborted.' })
}

export function unknownCalculationArg(unknown: string) {
  return L({
    ko: `알 수 없는 인자: ${unknown}`,
    en: `Unknown argument: ${unknown}`,
  })
}

export function dateTypeError() {
  return L({
    ko: 'from과 to는 YYYY-MM-DD 형식의 날짜 문자열이어야 합니다.',
    en: 'from and to must be date strings in YYYY-MM-DD format.',
  })
}

export function dayRangeError() {
  return L({
    ko: 'add_days는 −36,500~36,500 정수여야 합니다.',
    en: 'add_days must be an integer from −36,500 to 36,500.',
  })
}

export function calculationFallback() {
  return L({ ko: '계산 오류', en: 'Calculation error' })
}
