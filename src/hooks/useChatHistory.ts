import { App } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { editorStateToPlainText } from '../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { useApp } from '../contexts/app-context'
import { usePlugin } from '../contexts/plugin-context'
import { ChatConversationMetadata } from '../database/json/chat/types'
import { t } from '../i18n'
import {
  AuditEvent,
  AuditTurnRecord,
  ChatMessage,
  SerializedChatMessage,
  SkillWorkflowSelectionMode,
} from '../types/chat'
import { Mentionable } from '../types/mentionable'
import {
  deserializeMentionable,
  serializeMentionable,
} from '../utils/chat/mentionable'
import { dataEqual as isEqual } from '../utils/dataEqual'
import { debounceSave as debounce } from '../utils/debounceSave'

import { useChatManager } from './useJsonManagers'

type UseChatHistory = {
  createOrUpdateConversation: (
    id: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillNames?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void> | undefined
  saveConversationNow: (
    id: string,
    messages: ChatMessage[],
    auditLog?: AuditTurnRecord[],
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
    selectedSkillNames?: string[] | null,
    selectedWorkflowIds?: string[] | null,
  ) => Promise<void>
  flushPendingConversationSave: () => void
  deleteConversation: (id: string) => Promise<void>
  getChatMessagesById: (id: string) => Promise<ChatMessage[] | null>
  getChatById: (id: string) => Promise<{
    messages: ChatMessage[]
    auditLog: AuditTurnRecord[]
    skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
    selectedSkillNames?: string[]
    selectedWorkflowIds?: string[]
  } | null>
  updateConversationTitle: (id: string, title: string) => Promise<void>
  chatList: ChatConversationMetadata[]
  initializationError: string | null
  unreadableChatCount: number
}

function normalizeAuditLog(value: unknown): AuditTurnRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index) => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      Array.isArray((entry as { events?: unknown }).events)
    ) {
      return [entry as AuditTurnRecord]
    }
    // Migrate the pre-turn format in memory. It is written back in the new
    // grouped format on the next debounced conversation save.
    if (typeof entry === 'object' && entry !== null) {
      const event = entry as AuditEvent
      const turnId = event.turnId ?? `legacy-${event.timestamp}-${index}`
      return [
        {
          turnId,
          startedAt: event.timestamp,
          completedAt: event.timestamp,
          events: [event],
        },
      ]
    }
    return []
  })
}

export function useChatHistory(): UseChatHistory {
  const app = useApp()
  const plugin = usePlugin()
  const chatManager = useChatManager()
  const [chatList, setChatList] = useState<ChatConversationMetadata[]>([])
  const [unreadableChatCount, setUnreadableChatCount] = useState(0)
  const [initializationError, setInitializationError] = useState<string | null>(
    null,
  )

  const ensureChatReady = useCallback(
    async (notify: boolean): Promise<boolean> => {
      const startedAt = performance.now()
      const ready = await plugin.ensureReady({ notify })
      plugin.recordStartupDiagnostic('chat:ensure-ready', {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        ready,
        notify,
      })
      if (!ready) {
        setInitializationError(
          plugin.getReadinessSnapshot().initializationError ??
            plugin.getReadinessSnapshot().postMigrationUiError ??
            t('ui.useChatHistory.verbexInitializationIsNotComplete'),
        )
      }
      return ready
    },
    [plugin],
  )

  const fetchChatList = useCallback(async () => {
    const startedAt = performance.now()
    try {
      // The JSON storage service is created during onload. Reading the chat
      // list does not need skill/workflow discovery, BM25 reconciliation, or
      // the embedding database, so do not make the restored ChatView wait for
      // the full deferred plugin initialization here. Mutations and loading a
      // conversation still go through ensureChatReady below.
      const list = await chatManager.listChats()
      setChatList(list)
      const skipped = chatManager.getListDiagnostics().length
      setUnreadableChatCount(skipped)
      setInitializationError(null)
      plugin.recordStartupDiagnostic('chat:list-ready', {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        count: list.length,
        skippedUnreadable: skipped,
      })
    } catch (error) {
      setChatList([])
      setInitializationError(
        error instanceof Error ? error.message : String(error),
      )
      plugin.recordStartupDiagnostic('chat:list-failed', {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [chatManager, plugin])

  useEffect(() => {
    void fetchChatList()
  }, [])

  const saveConversationNow = useCallback(
    async (
      id: string,
      messages: ChatMessage[],
      auditLog?: AuditTurnRecord[],
      skillWorkflowSelectionMode?: SkillWorkflowSelectionMode,
      selectedSkillNames?: string[] | null,
      selectedWorkflowIds?: string[] | null,
    ): Promise<void> => {
      if (!(await ensureChatReady(true))) return
      const serializedMessages = messages.map(serializeChatMessage)
      const existingConversation = await chatManager.findById(id)
      const normalizedSelectedSkillNames = selectedSkillNames ?? undefined
      const normalizedSelectedWorkflowIds = selectedWorkflowIds ?? undefined

      if (existingConversation) {
        const messagesEqual = isEqual(
          existingConversation.messages,
          serializedMessages,
        )
        const auditLogEqual = isEqual(existingConversation.auditLog, auditLog)
        const selectionEqual =
          existingConversation.skillWorkflowSelectionMode ===
            skillWorkflowSelectionMode &&
          isEqual(
            existingConversation.selectedSkillNames,
            normalizedSelectedSkillNames,
          ) &&
          isEqual(
            existingConversation.selectedWorkflowIds,
            normalizedSelectedWorkflowIds,
          )
        if (messagesEqual && auditLogEqual && selectionEqual) return
        await chatManager.updateChat(existingConversation.id, {
          messages: serializedMessages,
          auditLog,
          skillWorkflowSelectionMode,
          selectedSkillNames: normalizedSelectedSkillNames,
          selectedWorkflowIds: normalizedSelectedWorkflowIds,
        })
      } else {
        const firstUserMessage = messages.find((v) => v.role === 'user')

        await chatManager.createChat({
          id,
          title: firstUserMessage?.content
            ? editorStateToPlainText(firstUserMessage.content).substring(0, 50)
            : 'New chat',
          messages: serializedMessages,
          auditLog,
          skillWorkflowSelectionMode,
          selectedSkillNames: normalizedSelectedSkillNames,
          selectedWorkflowIds: normalizedSelectedWorkflowIds,
        })
      }

      await fetchChatList()
    },
    [chatManager, ensureChatReady, fetchChatList],
  )

  const createOrUpdateConversation = useMemo(
    () => debounce(saveConversationNow, 300, { maxWait: 1000 }),
    [saveConversationNow],
  )

  const flushPendingConversationSave = useCallback(() => {
    void createOrUpdateConversation.flush()
  }, [createOrUpdateConversation])

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      if (!(await ensureChatReady(true))) return
      await chatManager.deleteChat(id)
      await fetchChatList()
    },
    [chatManager, ensureChatReady, fetchChatList],
  )

  const getChatMessagesById = useCallback(
    async (id: string): Promise<ChatMessage[] | null> => {
      if (!(await ensureChatReady(true))) return null
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        return null
      }
      return conversation.messages.map((message) =>
        deserializeChatMessage(message, app),
      )
    },
    [chatManager, app, ensureChatReady],
  )

  const getChatById = useCallback(
    async (
      id: string,
    ): Promise<{
      messages: ChatMessage[]
      auditLog: AuditTurnRecord[]
      skillWorkflowSelectionMode?: SkillWorkflowSelectionMode
      selectedSkillNames?: string[]
      selectedWorkflowIds?: string[]
    } | null> => {
      if (!(await ensureChatReady(true))) return null
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        return null
      }
      return {
        messages: conversation.messages.map((message) =>
          deserializeChatMessage(message, app),
        ),
        auditLog: normalizeAuditLog(conversation.auditLog),
        skillWorkflowSelectionMode: conversation.skillWorkflowSelectionMode,
        selectedSkillNames: conversation.selectedSkillNames,
        selectedWorkflowIds: conversation.selectedWorkflowIds,
      }
    },
    [chatManager, app, ensureChatReady],
  )

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (!(await ensureChatReady(true))) return
      if (title.length === 0) {
        throw new Error('Chat title cannot be empty')
      }
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        throw new Error('Conversation not found')
      }
      await chatManager.updateChat(conversation.id, {
        title,
      })
      await fetchChatList()
    },
    [chatManager, ensureChatReady, fetchChatList],
  )

  return {
    createOrUpdateConversation,
    saveConversationNow,
    flushPendingConversationSave,
    deleteConversation,
    getChatMessagesById,
    getChatById,
    updateConversationTitle,
    chatList,
    initializationError,
    unreadableChatCount,
  }
}

export const serializeChatMessage = (
  message: ChatMessage,
): SerializedChatMessage => {
  switch (message.role) {
    case 'user':
      return {
        role: 'user',
        verbexCallUsage: message.verbexCallUsage,
        content: message.content,
        promptContent: null,
        id: message.id,
        mentionables: message.mentionables.map(serializeMentionable),
        skillContext: message.skillContext,
        workflowContext: message.workflowContext,
        excludedSimilaritySearchResultIds:
          message.excludedSimilaritySearchResultIds,
        similaritySearchResults: undefined,
        modelId: message.modelId,
        pinnedConnectorTools: message.pinnedConnectorTools,
        excludedToolNames: message.excludedToolNames,
        contextModeOverride: message.contextModeOverride,
        companionScope: message.companionScope,
      }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        annotations: message.annotations,
        toolCallRequests: message.toolCallRequests,
        id: message.id,
        metadata: message.metadata,
        providerMetadata: message.providerMetadata,
        verbexCallUsage: message.verbexCallUsage,
        verbexToolSummary: message.verbexToolSummary,
        verbexChangeLedger: message.verbexChangeLedger,
        verbexLargeFileCard: message.verbexLargeFileCard,
        verbexRunState: message.verbexRunState,
      }
    case 'tool':
      return {
        role: 'tool',
        toolCalls: message.toolCalls,
        id: message.id,
      }
  }
}

export const deserializeChatMessage = (
  message: SerializedChatMessage,
  app: App,
): ChatMessage => {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        verbexCallUsage: message.verbexCallUsage,
        content: message.content,
        promptContent: null,
        id: message.id,
        mentionables: message.mentionables
          .map((m) => deserializeMentionable(m, app))
          .filter((m): m is Mentionable => m !== null),
        skillContext: message.skillContext,
        workflowContext: message.workflowContext,
        excludedSimilaritySearchResultIds:
          message.excludedSimilaritySearchResultIds,
        similaritySearchResults: undefined,
        modelId: message.modelId,
        pinnedConnectorTools: message.pinnedConnectorTools,
        excludedToolNames: message.excludedToolNames,
        contextModeOverride: message.contextModeOverride,
        companionScope: message.companionScope,
      }
    }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        annotations: message.annotations,
        toolCallRequests: message.toolCallRequests,
        id: message.id,
        metadata: message.metadata,
        providerMetadata: message.providerMetadata,
        verbexCallUsage: message.verbexCallUsage,
        verbexToolSummary: message.verbexToolSummary,
        verbexChangeLedger: message.verbexChangeLedger,
        verbexLargeFileCard: message.verbexLargeFileCard,
        verbexRunState: message.verbexRunState,
      }
    case 'tool':
      return {
        role: 'tool',
        toolCalls: message.toolCalls,
        id: message.id,
      }
  }
}
