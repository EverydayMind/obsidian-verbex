import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'
export const FORMAT_SOURCE_NOTICE = (locale: ModelLocale = getModelLocale()) =>
  L(
    {
      ko: '[서식 작업 샘플: 서식·문체 근거이며 새 문서 내용의 근거가 아님]',
      en: `[Format-job sample: format/style evidence, not evidence for new document content]`,
    },
    locale,
  )
