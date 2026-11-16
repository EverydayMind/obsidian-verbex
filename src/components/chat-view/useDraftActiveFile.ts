import type { App } from 'obsidian'
import { type Dispatch, type SetStateAction, useEffect } from 'react'

import type { ChatUserMessage } from '../../types/chat'

/** Only the draft follows active-file changes; submitted mentions are history. */
export function useDraftActiveFile(
  app: App,
  focusedId: string | null,
  draftId: string,
  setInput: Dispatch<SetStateAction<ChatUserMessage>>,
) {
  useEffect(() => {
    const changed = () => {
      if (!focusedId || focusedId !== draftId) return
      const file = app.workspace.getActiveFile()
      const ext = file?.extension.toLowerCase()
      const current =
        ext === 'md' || ext === 'hwp' || ext === 'hwpx' ? file : null
      setInput((previous) => ({
        ...previous,
        mentionables: [
          { type: 'current-file', file: current },
          ...previous.mentionables.filter(
            (item) => item.type !== 'current-file',
          ),
        ],
      }))
    }
    const ref = app.workspace.on('active-leaf-change', changed)
    return () => app.workspace.offref(ref)
  }, [app, focusedId, draftId, setInput])
}
