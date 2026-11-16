import { MutableRefObject, useCallback } from 'react'

import { TOOL_REGISTRY } from '../../core/tools/toolDefinitions'
import { L } from '../../i18n/modelText'
import { ChatMessage, ChatUserMessage } from '../../types/chat'
import { ToolCallRequest } from '../../types/tool-call.types'

import { plainTextToEditorState } from './chat-input/utils/plain-text-to-editor-state'

export function proposalDisplayContext(
  messages: ChatMessage[],
  providerNames: string[],
) {
  const assistantIndex = messages.findLastIndex(
    (message) => message.role === 'assistant',
  )
  const userIndex = messages.findLastIndex((message) => message.role === 'user')
  return {
    proposalNames: new Set([...Object.keys(TOOL_REGISTRY), ...providerNames]),
    lastAssistantId:
      assistantIndex > userIndex ? messages[assistantIndex]?.id : undefined,
  }
}

export function useProposalSubmission(
  messages: ChatMessage[],
  busy: boolean,
  reset: () => ChatUserMessage,
  seeds: MutableRefObject<Map<string, ToolCallRequest[]>>,
  submit: (input: {
    inputChatMessages: ChatMessage[]
    resetSubmittedInput?: boolean
  }) => Promise<unknown>,
) {
  return useCallback(
    async (calls: ToolCallRequest[], labels: string[]) => {
      if (busy) return
      const message: ChatUserMessage = {
        ...reset(),
        content: plainTextToEditorState(
          L({
            ko: `제안된 도구 호출 실행: ${labels.join(', ')}`,
            en: `Run proposed tool calls: ${labels.join(', ')}`,
          }),
        ),
      }
      seeds.current.set(message.id, calls)
      await submit({
        inputChatMessages: [...messages, message],
        resetSubmittedInput: true,
      })
    },
    [busy, messages, reset, seeds, submit],
  )
}
