import { t } from '../../i18n'

import type { BrowserStatus } from './browserStatus'

const STATE: Record<BrowserStatus['status'], string> = {
  running: t('ui.browserStatusText.running'),
  completed: t('ui.browserStatusText.executionRecordFound'),
  unknown_provider_restarted: t(
    'ui.browserStatusText.noRecordInCurrentProviderNotProof',
  ),
}
const DISPATCHED: Record<BrowserStatus['dispatched'], string> = {
  no: t('ui.browserStatusText.inputNotSent'),
  yes: t('ui.browserStatusText.inputSent'),
  partial: t('ui.browserStatusText.inputPartiallySent'),
  unknown: t('ui.browserStatusText.inputTransmissionUnknown'),
}
const APPLICATION: Record<BrowserStatus['application'], string> = {
  applied: t(
    'ui.browserStatusText.inputAppliedExternalOperationSuccessUnverified',
  ),
  not_applied: t('ui.browserStatusText.inputNotApplied'),
  unknown: t('ui.browserStatusText.inputApplicationUnknown'),
}

/**
 * Review-screen wording for a passive status answer (user decision
 * 2026-10-29: show pre-dispatch rejections here instead of changing the
 * execute-rejection = unknown contract). Reports the provider's record only;
 * it never clears the stop or claims what happened on the site.
 */
export function describeBrowserStatus(status: BrowserStatus): string {
  const counts =
    status.inputsSent !== undefined && status.inputsPlanned !== undefined
      ? t('ui.browserStatusText.actions', {
          p0:
            status.dispatched === 'unknown'
              ? t('ui.browserStatusText.recordedSteps')
              : '',
          p1: status.inputsSent,
          p2: status.inputsPlanned,
        })
      : ''
  const code = status.errorCode
    ? t('ui.browserStatusText.recordCode', { p0: status.errorCode })
    : ''
  const facts = `${STATE[status.status]}. ${DISPATCHED[status.dispatched]}${counts}. ${APPLICATION[status.application]}${code}.`
  const zeroInput =
    status.status === 'completed' &&
    status.dispatched === 'no' &&
    status.inputsSent === 0
      ? t('ui.browserStatusText.theProviderRecordedARejectionBeforeExecution')
      : ''
  return t('ui.browserStatusText.checkingStatusDoesNotUnblockTheAction', {
    p0: facts,
    p1: zeroInput,
  })
}
