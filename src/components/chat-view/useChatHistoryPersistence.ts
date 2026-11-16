import { Notice } from 'obsidian'
import { useCallback, useEffect, useRef } from 'react'

import { t } from '../../i18n'
import {
  AuditTurnRecord,
  ChatMessage,
  SkillWorkflowSelectionMode,
} from '../../types/chat'

export function useChatHistoryPersistence({
  chatMessages,
  conversationId,
  createOrUpdateConversation,
  saveConversationNow,
  flushPendingConversationSave,
  auditLog,
  skillWorkflowSelectionMode,
  selectedSkillNames,
  selectedWorkflowIds,
  isStreaming,
}: {
  chatMessages: ChatMessage[]
  conversationId: string
  createOrUpdateConversation: (
    conversationId: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillNames?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void> | undefined
  saveConversationNow: (
    conversationId: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillNames?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void>
  flushPendingConversationSave: () => void
  auditLog?: AuditTurnRecord[]
  skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
  selectedSkillNames?: string[] | null
  selectedWorkflowIds?: string[] | null
  isStreaming?: boolean
}) {
  const latestRef = useRef({
    chatMessages,
    conversationId,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillNames,
    selectedWorkflowIds,
  })
  latestRef.current = {
    chatMessages,
    conversationId,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillNames,
    selectedWorkflowIds,
  }

  const saveLatestNow = useCallback(() => {
    const latest = latestRef.current
    if (latest.chatMessages.length === 0) return
    void saveConversationNow(
      latest.conversationId,
      latest.chatMessages,
      latest.auditLog,
      latest.skillWorkflowSelectionMode,
      latest.selectedSkillNames,
      latest.selectedWorkflowIds,
    ).catch((error) => {
      new Notice(t('notices.chat.saveFailed'))
      console.error('Failed to save chat history', error)
    })
  }, [saveConversationNow])

  useEffect(() => {
    if (isStreaming) return
    const updateConversationAsync = async () => {
      try {
        if (chatMessages.length > 0) {
          await createOrUpdateConversation(
            conversationId,
            chatMessages,
            auditLog,
            skillWorkflowSelectionMode,
            selectedSkillNames,
            selectedWorkflowIds,
          )
        }
      } catch (error) {
        new Notice(t('notices.chat.saveFailed'))
        console.error('Failed to save chat history', error)
      }
    }
    void updateConversationAsync()
  }, [
    conversationId,
    chatMessages,
    createOrUpdateConversation,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillNames,
    selectedWorkflowIds,
    isStreaming,
  ])

  useEffect(() => {
    if (!isStreaming) return
    const intervalId = window.setInterval(() => {
      const latest = latestRef.current
      if (latest.chatMessages.length === 0) return
      void createOrUpdateConversation(
        latest.conversationId,
        latest.chatMessages,
        latest.auditLog,
        latest.skillWorkflowSelectionMode,
        latest.selectedSkillNames,
        latest.selectedWorkflowIds,
      )
    }, 5000)
    return () => window.clearInterval(intervalId)
  }, [createOrUpdateConversation, isStreaming])

  useEffect(
    () => () => {
      flushPendingConversationSave()
      saveLatestNow()
    },
    [flushPendingConversationSave, saveLatestNow],
  )
}
