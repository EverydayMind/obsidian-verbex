import type { ModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'

export function recommendCopyEdit(locale?: ModelLocale) {
  return L(
    {
      ko: '분해 대신 원본의 사본 편집을 권합니다.',
      en: 'Editing a copy of the original is recommended instead of decomposition.',
    },
    locale,
  )
}
export function decompositionReceiptPending(locale?: ModelLocale) {
  return L(
    {
      ko: '분해 파일 저장 뒤 영수증 확인이 필요합니다.',
      en: 'Receipt verification is required after saving the decomposition files.',
    },
    locale,
  )
}

export function defaultOutputName(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `${p0} - 작성`, en: `${p0} - Draft` }, locale)
}

export function formatJobNotReady(locale?: ModelLocale) {
  return `${modelMarker('toolError', locale)} ${L(
    {
      ko: '서식 작업이 준비되지 않았습니다.',
      en: 'The format job is not ready.',
    },
    locale,
  )})`
}

export function outputChanged(locale?: ModelLocale) {
  return `${modelMarker('toolError', locale)} ${L(
    {
      ko: '출력이 확인 중 바뀌었습니다. 다시 확인하세요.',
      en: 'The output changed during verification. Check it again.',
    },
    locale,
  )})`
}

export function derivationRejected(locale?: ModelLocale) {
  return L(
    {
      ko: '서식 파생이 거절되었습니다.',
      en: 'Format derivation was rejected.',
    },
    locale,
  )
}

export function productionReceiptUnverified(locale?: ModelLocale) {
  return L(
    {
      ko: '파일은 변경되었으나 저장 영수증을 검증할 수 없습니다. 자동으로 다시 저장하지 않습니다.',
      en: 'The file was changed, but the save receipt cannot be verified. It will not be saved again automatically.',
    },
    locale,
  )
}

export function decompositionStopped(locale?: ModelLocale) {
  return L(
    {
      ko: '분해 저장이 중단되었습니다.',
      en: 'Decomposition saving was stopped.',
    },
    locale,
  )
}

export function noPendingDecomposition(locale?: ModelLocale) {
  return L(
    {
      ko: '이 작업에는 저장을 기다리는 분해본이 없습니다. 이 도구를 다시 호출해도 결과는 같습니다. 분해본 저장은 선택 단계이며 새 문서 생성에 필요하지 않습니다. nextStep으로 진행하세요.',
      en: 'This job has no decomposition awaiting saving. Calling this tool again will give the same result. Saving the decomposition is optional and is not required to create a new document. Proceed with nextStep.',
    },
    locale,
  )
}
