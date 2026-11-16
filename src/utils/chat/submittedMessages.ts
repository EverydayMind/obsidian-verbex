import type {
  ChatMessage,
  ChatSkillContextItem,
  ChatWorkflowContextItem,
} from '../../types/chat'

/** Submission attaches chosen guides, never builds an unused body/RAG payload. */
export function submittedMessages(
  messages: ChatMessage[],
  lastId: string,
  skillContext: ChatSkillContextItem[],
  workflowContext: ChatWorkflowContextItem[],
): ChatMessage[] {
  return messages.map((message) =>
    message.role === 'user'
      ? {
          ...message,
          promptContent: null,
          similaritySearchResults: undefined,
          ...(message.id === lastId ? { skillContext, workflowContext } : {}),
        }
      : message,
  )
}
