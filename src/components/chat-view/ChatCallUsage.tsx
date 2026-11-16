import { t } from '../../i18n'
import type {
  ChatAssistantMessage,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'

export default function ChatCallUsage({
  message,
  contextMessages,
}: {
  message: ChatUserMessage | ChatAssistantMessage
  contextMessages: ChatMessage[]
}) {
  return (
    <>
      {message.verbexCallUsage?.map((call, index) => {
        const preceding = contextMessages.slice(
          0,
          contextMessages.findIndex((item) => item.id === message.id),
        )
        const prior = preceding.flatMap((item) =>
          item.role === 'tool' ? [] : (item.verbexCallUsage ?? []),
        )
        const calls = [
          ...prior,
          ...(message.verbexCallUsage ?? []).slice(0, index + 1),
        ]
        const total = calls.reduce(
          (sum, item) => sum + item.usage.total_tokens,
          0,
        )
        return (
          <div className="verbex-call-usage" key={index}>
            {t('ui.ChatCallUsage.calls')}
            {calls.length}: {call.estimated ? t('ui.ChatCallUsage.about') : ''}
            {call.usage.total_tokens.toLocaleString()}{' '}
            {t('ui.ChatCallUsage.tokensRecordedSessionTotal')}{' '}
            {calls.some((item) => item.estimated)
              ? t('ui.ChatCallUsage.about2')
              : ''}
            {total.toLocaleString()} {t('ui.ChatCallUsage.tokens')}
          </div>
        )
      })}
    </>
  )
}
