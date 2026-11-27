import { useMutation } from '@tanstack/react-query'
import { Notice } from 'obsidian'

import type VerbexPlugin from '../../main'

import { applyResultText } from './applyResultText'
import type { ApplyStrategy } from './ApplyTargetModal'

/** Applies an assistant draft or section to a note through the Diff pipeline. */
export function useApplyMutation(plugin: VerbexPlugin, conversationId: string) {
  return useMutation({
    mutationFn: async ({
      blockToApply,
      path,
      strategy,
      sectionHeading,
      before,
    }: {
      blockToApply: string
      path: string
      strategy: ApplyStrategy
      sectionHeading?: string
      before?: string
    }) => {
      const runId = `chat-${conversationId}`
      const outcome =
        before !== undefined
          ? await plugin.verbexController.applyBoundedSection({
              runId,
              path,
              before,
              block: blockToApply,
            })
          : await plugin.verbexController.applyDraftToNote({
              runId,
              path,
              content: blockToApply,
              strategy,
              sectionHeading,
            })
      new Notice(applyResultText(outcome))
    },
    onError: (error) => {
      new Notice(error.message)
      console.error('Failed to apply draft', error)
    },
  })
}
