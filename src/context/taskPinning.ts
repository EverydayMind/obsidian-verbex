import {
  contextBoundary,
  hasModelMarker,
  lastModelMarker,
} from '../i18n/modelMarkers'

type TaskMessage = {
  role: string
  content: string | readonly { type: string; text?: string }[]
}

export function requestMessageText(
  message: Pick<TaskMessage, 'content'>,
): string {
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('\n')
}

/** Remove controller-added grounding and leave only the user's actual request. */
export function extractUserRequest(text: string): string {
  const marker = lastModelMarker(text, 'userRequest')
  if (marker.index >= 0) {
    return text.slice(marker.index + marker.length).trim()
  }
  const context = contextBoundary(text)
  return (context >= 0 ? text.slice(0, context) : text).trim()
}

/** True for a real task/question, false for acknowledgements and bare NEXT turns. */
export function isSubstantiveUserText(text: string): boolean {
  const request = extractUserRequest(text)
  if (!request || hasModelMarker(request, 'systemNotice')) return false
  const normalized = request
    .trim()
    .toLowerCase()
    .replace(/[,.!?！？。~/·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length < 2) return false
  if (
    /^(?:yes|yep|ok|okay|no|nope)(?: please| thanks| thank you)$/i.test(
      normalized,
    )
  )
    return false
  if (
    /^(?:(?:ok|okay|yes|yep|sure|all right|alright)[ ,]+)*(?:please )?(?:go ahead|continue|proceed|carry on|keep going|next|do it|approved|approve|accept|agreed|understood|got it|thanks|thank you|sure|all right|alright)(?: please)?$/i.test(
      normalized,
    )
  )
    return false
  return !/^(?:(?:네|예|응|어|좋아|좋아요|알겠어|알겠습니다|알았어)\s+)*(?:진행|진행하세요|진행해|진행해\s*주세요|계속|계속하세요|계속해|계속해\s*주세요|다음|수락|승인|해줘|네|예|응|어|좋아|좋아요|알겠어|알겠습니다|알았어|고마워|고마워요|고맙습니다|감사합니다|감사해요|ok|okay|yes|yep|y|no|nope|n|go ahead|continue|next|proceed|thanks|thank you|done)$/i.test(
    normalized,
  )
}

export function findPinnedTaskIndex(messages: readonly TaskMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'user') continue
    if (isSubstantiveUserText(requestMessageText(message))) return index
  }
  return -1
}

/** Text of the latest assistant message, e.g. the question a selection answers. */
export function lastAssistantText(messages: readonly TaskMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant')
      return requestMessageText(messages[index])
  }
  return ''
}

export function lastSubstantiveUserText(
  messages: readonly TaskMessage[],
  fallback = '',
): string {
  const index = findPinnedTaskIndex(messages)
  return index >= 0
    ? extractUserRequest(requestMessageText(messages[index]))
    : fallback
}
