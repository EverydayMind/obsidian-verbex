import type { ModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'

export function ownershipUnverified(locale?: ModelLocale) {
  return L(
    {
      ko: '열린 문서의 소유권을 확인하지 못했습니다. 이전 호출이 끝난 뒤 다시 요청하세요.',
      en: 'Could not verify ownership of the open document. Wait for the previous call to finish and request again.',
    },
    locale,
  )
}

export function registrationUnverified(locale?: ModelLocale) {
  return L(
    {
      ko: '동반 편집 provider 등록을 확인하지 못했습니다.',
      en: 'Could not verify companion editing provider registration.',
    },
    locale,
  )
}
