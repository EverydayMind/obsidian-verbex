import { useCallback, useEffect, useRef, useState } from 'react'

import type { LoadedChatConversation } from '../../hooks/useChatHistory'
import {
  type RestoredConversationSelection,
  type SkillCatalogEntry,
  restoreConversationSkillSelection,
} from '../../skills/legacySkillSelection'
import { readStoredSkillContext } from '../../skills/skillSelectionSource'
import type { ChatMessage } from '../../types/chat'

export function useDeferredLegacySkillResolution(
  loadSkills: () => Promise<readonly SkillCatalogEntry[]>,
  onResolved: (result: {
    messages: ChatMessage[]
    selection: RestoredConversationSelection
  }) => void,
) {
  // Conversation whose legacy resolution is pending (or was abandoned by
  // leaving it). Autosave must skip this conversation until a user action in it
  // or a completed resolution clears the id.
  const [pausedConversationId, setPausedConversationId] = useState<
    string | null
  >(null)
  const seqRef = useRef(0)
  const pendingRef = useRef<{
    seq: number
    conversationId: string
    conversation: LoadedChatConversation
  } | null>(null)
  const onResolvedRef = useRef(onResolved)
  onResolvedRef.current = onResolved

  const applyPending = useCallback(
    (seq: number, catalog: readonly SkillCatalogEntry[]) => {
      const pending = pendingRef.current
      if (!pending || pending.seq !== seq) return
      pendingRef.current = null
      setPausedConversationId(null)
      const { conversation } = pending
      const rawById = conversation.legacySkillContexts
      const messages = rawById?.size
        ? conversation.messages.map((message) => {
            if (message.role !== 'user') return message
            const raw = rawById.get(message.id)
            if (!raw) return message
            return {
              ...message,
              skillContext: readStoredSkillContext(raw, catalog),
            }
          })
        : conversation.messages
      const selection = restoreConversationSkillSelection(
        { ...conversation, messages },
        catalog,
      )
      onResolvedRef.current({ messages, selection })
    },
    [],
  )

  /** A user action inside the conversation: ends the pause so it can save. */
  const cancelLegacyResolution = useCallback(() => {
    seqRef.current += 1
    pendingRef.current = null
    setPausedConversationId(null)
  }, [])

  /**
   * Leaving the conversation (load another, new chat): stops the pending
   * resolution but keeps the pause, so the interim state is never saved.
   */
  const leaveLegacyResolution = useCallback(() => {
    seqRef.current += 1
    pendingRef.current = null
  }, [])

  const scheduleLegacyResolution = useCallback(
    (conversationId: string, conversation: LoadedChatConversation) => {
      const seq = (seqRef.current += 1)
      pendingRef.current = { seq, conversationId, conversation }
      setPausedConversationId(conversationId)
      void loadSkills()
        .then((catalog) => applyPending(seq, catalog))
        .catch(() => {
          if (pendingRef.current?.seq !== seq) return
          pendingRef.current = null
          setPausedConversationId(null)
        })
    },
    [applyPending, loadSkills],
  )

  const resolvePendingWithCatalog = useCallback(
    (catalog: readonly SkillCatalogEntry[]) => {
      const pending = pendingRef.current
      if (!pending || catalog.length === 0) return
      applyPending(pending.seq, catalog)
    },
    [applyPending],
  )

  useEffect(
    () => () => {
      seqRef.current += 1
      pendingRef.current = null
    },
    [],
  )

  return {
    pausedConversationId,
    cancelLegacyResolution,
    leaveLegacyResolution,
    scheduleLegacyResolution,
    resolvePendingWithCatalog,
  }
}
