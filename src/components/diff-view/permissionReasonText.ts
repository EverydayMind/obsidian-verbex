import { t } from '../../i18n'

// Presentation only: retain the permission reason in approvals and audit records.
const REASON_KEYS: Readonly<Record<string, string>> = {
  'Explicit approval required before writing.':
    'ui.VerbexDiffReview.explicitApproval',
  'Diff review required before applying.': 'ui.VerbexDiffReview.diffRequired',
  'This note tidy change always requires explicit approval.':
    'ui.VerbexDiffReview.tidyApproval',
  'Auto Mode: applies after a cancellable countdown.':
    'ui.VerbexDiffReview.autoApproval',
  'Trusted for this session.': 'ui.VerbexDiffReview.sessionTrust',
  'This write empties or drastically shrinks an existing file (an implicit delete) and requires explicit approval.':
    'ui.VerbexDiffReview.destructiveApproval',
}

export function permissionReasonText(reason: string): string {
  const key = Object.prototype.hasOwnProperty.call(REASON_KEYS, reason)
    ? REASON_KEYS[reason]
    : undefined
  return key ? t(key) : reason
}
