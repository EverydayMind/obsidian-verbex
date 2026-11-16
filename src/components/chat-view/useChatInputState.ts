import { App } from 'obsidian'
import { useCallback, useState } from 'react'

import { ChatUserMessage } from '../../types/chat'
import { MentionableBlock, MentionableBlockData } from '../../types/mentionable'
import {
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { uuidv4 } from '../../utils/uuid'

export const getNewInputMessage = (
  app: App,
  selectedBlock?: MentionableBlockData,
): ChatUserMessage => {
  const activeFile = app.workspace.getActiveFile()
  const mentionables: ChatUserMessage['mentionables'] =
    activeFile &&
    ['md', 'hwpx', 'hwp'].includes(activeFile.extension.toLowerCase())
      ? [
          {
            type: 'current-file',
            file: activeFile,
          },
        ]
      : []

  if (selectedBlock) {
    mentionables.push({
      type: 'block',
      ...selectedBlock,
    })
  }

  return {
    role: 'user',
    content: null,
    promptContent: null,
    id: uuidv4(),
    mentionables,
  }
}

function getSelectedBlockKey(selectedBlock?: MentionableBlockData) {
  if (!selectedBlock) {
    return null
  }
  return getMentionableKey(
    serializeMentionable({
      type: 'block',
      ...selectedBlock,
    }),
  )
}

export function useChatInputState(
  app: App,
  selectedBlock?: MentionableBlockData,
) {
  const [inputMessage, setInputMessage] = useState<ChatUserMessage>(() =>
    getNewInputMessage(app, selectedBlock),
  )
  const [addedBlockKey, setAddedBlockKey] = useState<string | null>(() =>
    getSelectedBlockKey(selectedBlock),
  )

  const resetInputMessage = useCallback(
    (nextSelectedBlock?: MentionableBlockData) => {
      const nextInputMessage = getNewInputMessage(app, nextSelectedBlock)
      setInputMessage(nextInputMessage)
      setAddedBlockKey(getSelectedBlockKey(nextSelectedBlock))
      return nextInputMessage
    },
    [app],
  )

  const setAddedBlock = useCallback(
    (mentionable: Omit<MentionableBlock, 'id'>) => {
      setAddedBlockKey(getMentionableKey(serializeMentionable(mentionable)))
    },
    [],
  )

  return {
    inputMessage,
    setInputMessage,
    addedBlockKey,
    setAddedBlockKey,
    resetInputMessage,
    setAddedBlock,
  }
}
