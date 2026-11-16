import { L } from '../../i18n/modelText'

import type { JsonObject } from './protocol'

export function createdTabText(target?: JsonObject): string {
  if (!target) return ''
  const identity = JSON.stringify({
    tabId: target.tabId,
    incarnation: target.incarnation,
  })
  return L({
    ko: ` 생성된 탭 신원: ${identity}. 후속 조작 전에 이 tabId로 새로 관측하고 호출별 승인을 받으세요.`,
    en: ` Created tab identity: ${identity}. Before any follow-up interaction, observe this tabId again and obtain approval for each call.`,
  })
}
