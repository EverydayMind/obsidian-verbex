import type { ChatMessage } from '../../types/chat'

export function insertAfterMessage(
  messages: ChatMessage[],
  targetId: string,
  inserted: ChatMessage[],
  signal?: AbortSignal,
): ChatMessage[] {
  if (signal?.aborted) return messages
  const index = messages.findIndex(
    (m) => m.id === targetId && m.role === 'assistant',
  )
  if (index < 0) return messages
  return [
    ...messages.slice(0, index + 1),
    ...inserted,
    ...messages.slice(index + 1),
  ]
}
