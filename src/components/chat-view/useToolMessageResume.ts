import { UseMutationResult } from '@tanstack/react-query'
import { Dispatch, SetStateAction, useCallback, useMemo } from 'react'

import type { CommitFact } from '../../provider/interop/commitStatus'
import { ChatMessage, ChatToolMessage } from '../../types/chat'
import { ToolCallResponseStatus } from '../../types/tool-call.types'

const COMPLETED_TOOL_STATUSES: ToolCallResponseStatus[] = [
  ToolCallResponseStatus.Success,
  ToolCallResponseStatus.Error,
]

const RESUMABLE_TOOL_STATUSES: ToolCallResponseStatus[] = [
  ToolCallResponseStatus.Aborted,
  ToolCallResponseStatus.Rejected,
  ToolCallResponseStatus.Error,
  ToolCallResponseStatus.Success,
]

export function useToolMessageResume({
  chatMessages,
  conversationId,
  forceScrollToBottom,
  getMcpManager,
  setChatMessages,
  submitChatMutation,
}: {
  chatMessages: ChatMessage[]
  conversationId: string
  forceScrollToBottom: () => void
  getMcpManager: () => Promise<{
    abortToolCall: (id: string) => boolean
  }>
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  submitChatMutation: UseMutationResult<
    void,
    Error,
    { chatMessages: ChatMessage[]; conversationId: string }
  >
}) {
  // Display-only status checks must not trigger the legacy tool-response resume path.
  const handleCommitUpdate = useCallback(
    (messageId: string, callId: string, commit: CommitFact) => {
      setChatMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.role === 'tool'
            ? {
                ...message,
                toolCalls: message.toolCalls.map((call) =>
                  call.request.id === callId ? { ...call, commit } : call,
                ),
              }
            : message,
        ),
      )
    },
    [setChatMessages],
  )
  const handleToolMessageUpdate = useCallback(
    async (toolMessage: ChatToolMessage) => {
      const toolMessageIndex = chatMessages.findIndex(
        (message) => message.id === toolMessage.id,
      )
      if (toolMessageIndex === -1) {
        void (async () => {
          const mcpManager = await getMcpManager()
          toolMessage.toolCalls.forEach((toolCall) => {
            mcpManager.abortToolCall(toolCall.request.id)
          })
        })()
        return
      }

      const updatedMessages = chatMessages.map((message) =>
        message.id === toolMessage.id ? toolMessage : message,
      )
      setChatMessages(updatedMessages)

      if (
        toolMessageIndex === chatMessages.length - 1 &&
        toolMessage.toolCalls.every((toolCall) =>
          COMPLETED_TOOL_STATUSES.includes(toolCall.response.status),
        )
      ) {
        submitChatMutation.mutate({
          chatMessages: updatedMessages,
          conversationId,
        })
        requestAnimationFrame(() => {
          forceScrollToBottom()
        })
      }
    },
    [
      chatMessages,
      conversationId,
      forceScrollToBottom,
      getMcpManager,
      setChatMessages,
      submitChatMutation,
    ],
  )

  const showContinueResponseButton = useMemo(() => {
    if (submitChatMutation.isPending) return false

    const lastMessage = chatMessages.at(-1)
    if (lastMessage?.role !== 'tool') return false

    return lastMessage.toolCalls.every((toolCall) =>
      RESUMABLE_TOOL_STATUSES.includes(toolCall.response.status),
    )
  }, [chatMessages, submitChatMutation.isPending])

  const handleContinueResponse = useCallback(() => {
    submitChatMutation.mutate({
      chatMessages,
      conversationId,
    })
  }, [chatMessages, conversationId, submitChatMutation])

  return {
    handleContinueResponse,
    handleToolMessageUpdate,
    handleCommitUpdate,
    showContinueResponseButton,
  }
}
