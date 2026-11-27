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
  selectedSkillIds,
  selectedWorkflowIds,
  isStreaming,
  pausedConversationId,
}: {
  chatMessages: ChatMessage[]
  conversationId: string
  createOrUpdateConversation: (
    conversationId: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillIds?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void> | undefined
  saveConversationNow: (
    conversationId: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillIds?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void>
  flushPendingConversationSave: () => void
  auditLog?: AuditTurnRecord[]
  skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
  selectedSkillIds?: string[] | null
  selectedWorkflowIds?: string[] | null
  isStreaming?: boolean
  /** Autosave and flushes skip this conversation id (pending legacy Skills). */
  pausedConversationId?: string | null
}) {
  const pausePersistence =
    pausedConversationId != null && pausedConversationId === conversationId
  const latestRef = useRef({
    chatMessages,
    conversationId,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillIds,
    selectedWorkflowIds,
    pausePersistence,
  })
  latestRef.current = {
    chatMessages,
    conversationId,
    auditLog,
    skillWorkflowSelectionMode,
    selectedSkillIds,
    selectedWorkflowIds,
    pausePersistence,
  }

  const saveLatestNow = useCallback(() => {
    const latest = latestRef.current
    if (latest.pausePersistence || latest.chatMessages.length === 0) return
    void saveConversationNow(
      latest.conversationId,
      latest.chatMessages,
      latest.auditLog,
      latest.skillWorkflowSelectionMode,
      latest.selectedSkillIds,
      latest.selectedWorkflowIds,
    ).catch((error) => {
      new Notice(t('notices.chat.saveFailed'))
      console.error('Failed to save chat history', error)
    })
  }, [saveConversationNow])

  useEffect(() => {
    if (isStreaming || pausePersistence) return
    const updateConversationAsync = async () => {
      try {
        if (chatMessages.length > 0) {
          await createOrUpdateConversation(
            conversationId,
            chatMessages,
            auditLog,
            skillWorkflowSelectionMode,
            selectedSkillIds,
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
    selectedSkillIds,
    selectedWorkflowIds,
    isStreaming,
    pausePersistence,
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
        latest.selectedSkillIds,
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
