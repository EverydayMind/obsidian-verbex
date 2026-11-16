import { t } from '../../i18n'
import { ChatMessage } from '../../types/chat'

import { formatAgentErrorForUser } from './formatAgentErrorForUser'

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/** Preserves any streamed text while marking its assistant turn as incomplete. */
export function markRunStateOnError(
  messages: ChatMessage[],
  responseId: string,
  error: unknown,
): ChatMessage[] {
  const runState = isAbortError(error)
    ? { status: 'cancelled' as const, label: t('ui.runStateOnError.aborted') }
    : {
        status: 'failed' as const,
        label: t('ui.runStateOnError.stoppedByError'),
        detail: formatAgentErrorForUser(error),
      }
  return messages.map((message) =>
    message.id === responseId && message.role === 'assistant'
      ? { ...message, verbexRunState: runState }
      : message,
  )
}
