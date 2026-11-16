import { App, normalizePath } from 'obsidian'
import { useCallback } from 'react'

import {
  resolveApplyFile,
  resolveBoundedSectionBlock,
  suggestSectionHeading,
} from '../../core/apply/sectionBlockApply'
import { ChatMessage } from '../../types/chat'

import { ApplyStrategy, ApplyTargetModal } from './ApplyTargetModal'

type ApplyInput = {
  blockToApply: string
  path: string
  strategy: ApplyStrategy
  sectionHeading?: string
  before?: string
}
export function useApplyTarget(app: App, mutate: (input: ApplyInput) => void) {
  const getDefaultApplyPath = useCallback(
    (filename?: string) => {
      if (filename) return normalizePath(filename)
      const activeFile = app.workspace.getActiveFile()
      if (activeFile) return activeFile.path
      return `Verbex Drafts/${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)}.md`
    },
    [app.workspace],
  )

  const handleApply = useCallback(
    async (
      blockToApply: string,
      _chatMessages: ChatMessage[],
      filename?: string,
    ) => {
      const file = resolveApplyFile(app, filename)
      const suggestionFile =
        file ?? resolveApplyFile(app, getDefaultApplyPath(filename))
      let before: string | undefined
      if (suggestionFile) {
        try {
          before = await app.vault.read(suggestionFile)
        } catch {
          /* Keep the target dialog available. */
        }
      }
      if (
        file &&
        before !== undefined &&
        !('ambiguous' in resolveBoundedSectionBlock(blockToApply, before))
      ) {
        mutate({
          blockToApply,
          path: filename ?? file.path,
          strategy: 'section',
          before,
        })
        return
      }
      const heading =
        before === undefined
          ? undefined
          : suggestSectionHeading(blockToApply, before)
      new ApplyTargetModal(app, {
        initialPath: getDefaultApplyPath(filename),
        initialStrategy: heading ? 'section' : undefined,
        initialSectionHeading: heading,
        onSubmit: ({ path, strategy, sectionHeading }) =>
          mutate({
            blockToApply,
            path,
            strategy,
            sectionHeading,
          }),
      }).open()
    },
    [app, mutate, getDefaultApplyPath],
  )

  return handleApply
}
