import { ContentPart, RequestMessage } from '../../types/llm/request'

/**
 * Concatenates message contents, handling both string and ContentPart[] formats.
 * Returns either a string or ContentPart[] depending on the message role.
 */
function concatenateMessageContent(
  prevContent: string | ContentPart[],
  currentContent: string | ContentPart[],
): string | ContentPart[] {
  const prevParts: ContentPart[] =
    typeof prevContent === 'string'
      ? [{ type: 'text', text: prevContent }]
      : prevContent
  const currParts: ContentPart[] =
    typeof currentContent === 'string'
      ? [{ type: 'text', text: currentContent }]
      : currentContent

  const merged = [...prevParts, ...currParts].filter(
    (part) => !(part.type === 'text' && part.text.trim().length === 0),
  )
  if (merged.every((part) => part.type === 'text')) {
    return merged.map((part) => part.text).join('\n\n')
  }
  return merged
}

/**
 * Formats the messages to ensure proper alternation between user and
 * assistant messages. Consecutive user messages are merged because they have
 * no protocol metadata beyond their content. Assistant and tool messages are
 * kept as individual entries: assistant tool calls must be followed by one
 * tool response per call, and merging tool responses would discard their
 * individual `tool_call_id`s on the provider wire format.
 *
 * If a user-message merge involves ContentPart[] and/or string
 * representations, both are first normalized into arrays, then merged so
 * that all text parts are combined.
 *
 * This function helps maintain proper message structure for LLM APIs that require
 * alternating user and assistant messages while preserving the tool-call
 * protocol required by OpenAI-compatible providers.
 *
 * All system messages are collected, concatenated, and placed at the beginning.
 */
export function formatMessages(messages: RequestMessage[]): RequestMessage[] {
  const formattedMessages: RequestMessage[] = []

  const systemMessages = messages.filter((msg) => msg.role === 'system')
  const nonSystemMessages = messages.filter((msg) => msg.role !== 'system')

  // Collect all system messages and concatenate them
  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages
      .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
      .filter((content) => content.trim().length > 0)
      .join('\n\n')

    if (combinedSystemContent.trim().length > 0) {
      formattedMessages.push({
        role: 'system',
        content: combinedSystemContent,
      })
    }
  }

  // Merge only consecutive user messages. Tool responses must remain one
  // message per call; otherwise the provider serializer retains only the
  // first tool_call_id and the API rejects the request as incomplete.
  for (const currentMessage of nonSystemMessages) {
    const prevMessage = formattedMessages[formattedMessages.length - 1]

    if (prevMessage?.role === 'user' && currentMessage.role === 'user') {
      prevMessage.content = concatenateMessageContent(
        prevMessage.content,
        currentMessage.content,
      )
    } else {
      formattedMessages.push({ ...currentMessage })
    }
  }

  return formattedMessages
}
