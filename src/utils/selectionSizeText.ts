import type { ModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

export function unknownSelectionSize(
  p0: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `${p0} 이상 (일부 파일 크기 확인 불가)`,
      en: `at least ${p0} (some file sizes are unavailable)`,
    },
    locale,
  )
}
export function selectionSizeSummary(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `선택 항목: ${p0}
.md 파일 총 ${p1}개, 합계 ${p2}`,
      en: `Selected items: ${p0}
Total .md files: ${p1}, combined size: ${p2}`,
    },
    locale,
  )
}
