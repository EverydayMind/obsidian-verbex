import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function partialProjection(locale: ModelLocale = getModelLocale()) {
  return L(
    {
      ko: ' 추출이 잘려 원본 전체 coverage가 아닙니다.',
      en: ' Extraction was truncated; coverage does not include the entire source.',
    },
    locale,
  )
}
