import { L } from '../../../i18n/modelText'

/**
 * Host-composed model-facing facts for a tool its providing plugin reports as
 * unusable right now (host-capabilities-v1 section 8). The provider's own
 * reason is for people only and never appears here.
 */
export function hiddenToolsNote(names: readonly string[]): string {
  if (!names.length) return ''
  const list = names.join(', ')
  return L({
    ko: `[호스트 기능 상태] ${list} 도구는 제공 플러그인이 지금 쓸 수 없다고 알려 이번 요청에 노출하지 않았다. 대체 도구로 흉내 내지 않는다.`,
    en: `[Host capability status] Tools ${list} were not exposed in this request because the providing plugin reports they cannot be used right now. Do not imitate them with other tools.`,
  })
}

export function hiddenToolRefusal(name: string): string {
  return L({
    ko: `${name} 도구는 제공 플러그인이 지금 쓸 수 없다고 알려 실행하지 않았습니다. 대체 도구로 흉내 내지 말고 이 사실을 사용자에게 알리세요.`,
    en: `Tool ${name} was not executed because the providing plugin reports it cannot be used right now. Do not imitate it with other tools; tell the user this.`,
  })
}
