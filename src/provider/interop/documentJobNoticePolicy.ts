import type { DocumentJobTurnPolicy } from './documentJobTurnPolicy'
import { documentUserRequest } from './exposureTier'

const FORMAT_REQUEST_WORD =
  /양식|서식|형식|틀|샘플|견본|템플릿|\btemplates?\b|\bformat(?:s|ting)?\b|\bstyles?\b/i

const NOTIFY_POLICY_REASONS = new Set([
  'pending_production',
  'retry_blocked',
  'active_job',
])

export function shouldNotifyDocumentJobBlocked(
  policy: DocumentJobTurnPolicy,
  request = '',
): boolean {
  return (
    policy.intended ||
    policy.reason.some((reason) => NOTIFY_POLICY_REASONS.has(reason)) ||
    FORMAT_REQUEST_WORD.test(documentUserRequest(request))
  )
}
