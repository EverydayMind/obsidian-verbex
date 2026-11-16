import { L } from '../../i18n/modelText'

export function ocr() {
  return L({ ko: `; 수동 OCR 필요`, en: `; manual OCR required` })
}

export function noReader(p0: string | number) {
  return L({
    ko: `no_exposed_reader; ${p0}; 문서 reader의 설치·활성·승인·이번 턴 노출을 확인하세요`,
    en: `no_exposed_reader; ${p0}; check document reader installation, activation, approval, and exposure in this turn`,
  })
}

export function none() {
  return L({ ko: `(없음)`, en: `(none)` })
}

export function unsupported(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
) {
  return L({
    ko: `파일이 존재하지만 이 도구가 읽을 수 없는 형식입니다: ${p0} (format=${p1}, 읽기 형식=${p2}, next=${p3})`,
    en: `The file exists, but this tool cannot read its format: ${p0} (format=${p1}, readable formats=${p2}, next=${p3})`,
  })
}
