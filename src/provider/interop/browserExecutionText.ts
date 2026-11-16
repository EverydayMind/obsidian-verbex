import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function browserExpired(locale?: ModelLocale) {
  return L(
    {
      ko: '브라우저 동작 승인 시간이 만료되어 실행하지 않았습니다. 다시 관측하고 요청하세요.',
      en: 'Browser action approval expired, so the action was not executed. Observe again and request approval.',
    },
    locale,
  )
}
export function browserGateClosed(locale?: ModelLocale) {
  return L(
    {
      ko: '브라우저 실행 게이트가 닫혀 있습니다.',
      en: 'The browser execution gate is closed.',
    },
    locale,
  )
}

export function browserRejected(locale?: ModelLocale) {
  return L(
    {
      ko: '브라우저 동작을 거절했습니다.',
      en: 'The browser action was rejected.',
    },
    locale,
  )
}

export function browserChanged(locale?: ModelLocale) {
  return L(
    {
      ko: '브라우저 동작이 실행 전에 취소되었거나 플러그인이 변경되었습니다.',
      en: 'The browser action was cancelled before execution or the plugin changed.',
    },
    locale,
  )
}
