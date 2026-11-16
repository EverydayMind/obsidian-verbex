import { Notice } from 'obsidian'

import { t } from '../../i18n'

import { documentJobApprovalCauses } from './documentJobRecovery'
import type { NativeProviderHost } from './NativeProviderHost'

const notified = new WeakMap<NativeProviderHost, Set<string>>()
const RECENT_TURN_LIMIT = 100

/** Same injected notification pattern as BrowserRuntime.notifyExpired. */
export function notifyDocumentJobBlocked(
  host: NativeProviderHost,
  runId: string,
  result: Record<string, unknown>,
  submittedTurnId?: string,
) {
  const recovery = result.recovery as Record<string, unknown> | undefined
  if (
    result.state !== 'blocked' ||
    !recovery ||
    typeof recovery.cause !== 'string' ||
    typeof recovery.userAction !== 'string' ||
    !documentJobApprovalCauses.has(recovery.cause)
  )
    return
  const turns = notified.get(host) ?? new Set<string>()
  const key = JSON.stringify([runId, submittedTurnId ?? runId])
  if (turns.has(key)) return
  turns.add(key)
  if (turns.size > RECENT_TURN_LIMIT) {
    const [oldest] = turns
    if (oldest !== undefined) turns.delete(oldest)
  }
  notified.set(host, turns)
  const notify =
    host.options.documentJobNotice ??
    ((text: string) => {
      new Notice(text)
    })
  notify(
    t('ui.documentJobNotice.hWPXFormatJobBlocked', {
      p0: recovery.cause,
      p1: recovery.userAction,
    }),
  )
}
