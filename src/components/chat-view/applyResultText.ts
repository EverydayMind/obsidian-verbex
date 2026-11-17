import { t } from '../../i18n'
import type { ChangeOutcome } from '../../workflow/StepExecutor'

export function applyResultText(outcome: ChangeOutcome): string {
  const key =
    outcome.status === 'applied' || outcome.status === 'partially_applied'
      ? 'ui.Chat.appliedResult'
      : 'ui.Chat.notAppliedResult'
  const reason = outcome.reason ?? outcome.error ?? ''
  return t(key, {
    p0: outcome.change.path,
    p1: reason ? ` (${reason})` : '',
  })
}
