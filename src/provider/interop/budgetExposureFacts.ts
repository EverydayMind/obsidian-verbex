import { L } from '../../i18n/modelText'

import { budgetToolList } from './budgetToolList'
import type { AvailableExposureReason } from './exposureReasons'
import type { NativeToolEntry } from './NativeProviderHost'

export function budgetExposureFacts(
  entries: readonly NativeToolEntry[],
  reasons: readonly AvailableExposureReason[],
  automaticIds: readonly string[],
  reservedNames: readonly string[],
  providerName: (id: string) => string,
) {
  const reserved = new Set(reservedNames)
  const omittedProviders: { id: string; name: string; tools: string[] }[] = []
  const notes: string[] = []
  for (const id of new Set(entries.map((entry) => entry.providerId))) {
    const tools = entries.filter((entry) => entry.providerId === id)
    const reason = (name: string) =>
      reasons.find((item) => item.name === name)?.reason
    const missing = tools.filter((entry) =>
      ['budget', 'budget_blocked'].includes(reason(entry.name) ?? ''),
    )
    if (!missing.length) continue
    const name = providerName(id)
    const whole = !tools.some((entry) => reason(entry.name) === 'exposed')
    if (whole && !automaticIds.includes(id)) continue
    if (whole)
      omittedProviders.push({
        id,
        name,
        tools: missing.map((entry) => entry.name),
      })
    const shown = missing
      .map((entry) => entry.name)
      .filter((tool) => !reserved.has(tool))
    if (!shown.length) continue
    const list = budgetToolList(shown)
    notes.push(
      L({
        ko: `[호스트 사실: 도구 예산] ${name}(${id})의 ${whole ? '도구는' : '일부 도구는'} 이번 요청의 도구 예산에 들지 못해 실리지 않았다: ${list}. 이 도구들은 이번 요청에서 호출할 수 없다. 사용자는 채팅의 "도구"에서 필요한 도구를 고정할 수 있다.`,
        en: `[Host fact: tool budget] ${whole ? 'Tools' : 'Some tools'} from ${name}(${id}) did not fit this request's tool budget and were omitted: ${list}. They cannot be called in this request. The user can pin required tools in the chat's "Tools" selector.`,
      }),
    )
  }
  return { omittedProviders, note: notes.join('\n') }
}
