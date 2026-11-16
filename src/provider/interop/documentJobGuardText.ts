import { L } from '../../i18n/modelText'

export function templateDialectChanged() {
  return L({
    ko: '템플릿 dialect가 바뀌었습니다. 다시 준비하세요.',
    en: 'The template dialect has changed. Prepare the job again.',
  })
}

export function oversizedPreviewFact() {
  return {
    state: 'conversion_failed',
    failure: {
      code: 'preview_result_too_large',
      message: L({
        ko: '시험 변환 결과가 크기 한도를 초과했습니다.',
        en: 'The trial conversion result exceeded the size limit.',
      }),
    },
  }
}
