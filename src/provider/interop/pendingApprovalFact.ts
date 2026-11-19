import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

import type { PendingPluginApproval } from './pendingPluginApprovals'

/** Manifest name, id and state only; descriptor values never appear here. */
export function formatPendingApprovalNames(
  pending: readonly PendingPluginApproval[],
  locale?: ModelLocale,
): string {
  const names = pending
    .slice(0, 8)
    .map(
      ({ id, name, state }) =>
        `${name} (${id}, ${L({ ko: state === 'pending' ? '승인 대기' : '재승인 필요', en: state === 'pending' ? 'waiting' : 'needs reapproval' }, locale)})`,
    )
    .join(', ')
  const more =
    pending.length > 8
      ? L(
          {
            ko: ` 외 ${pending.length - 8}개`,
            en: ` +${pending.length - 8} more`,
          },
          locale,
        )
      : ''
  return `${names}${more}`
}

/**
 * One fact line for a document read that could not deliver text. It names
 * what is waiting; it does not claim any of them reads this format.
 */
export function pendingApprovalReadFact(
  pending: readonly PendingPluginApproval[],
  locale?: ModelLocale,
): string {
  if (!pending.length) return ''
  const names = formatPendingApprovalNames(pending, locale)
  return L(
    {
      ko: `승인 대기 중인 플러그인: ${names}. 이 파일을 읽는 데 그 도구가 필요하면 할 수 없다고 답하지 말고 Verbex 설정 › 도구 관리 › 도구 승인에서 승인하라고 안내하세요.`,
      en: `Plugins waiting for approval: ${names}. If reading this file needs one of them, tell the user to approve it in Verbex settings › Tool management › Tool approval instead of saying it cannot be done. Answer in the language of the user's request.`,
    },
    locale,
  )
}
