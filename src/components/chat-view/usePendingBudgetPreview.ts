import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { pluginIsEnabled } from '../../provider/interop/discovery'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { contextTypeFromExtension } from '../../skills/skillScope'
import type { ChatMessage } from '../../types/chat'

import { previewSkillBudget } from './skillBudgetTurn'

type Preview = Awaited<ReturnType<typeof previewSkillBudget>>

/**
 * The Skills the budget would leave out if the user proceeds now. Recomputed
 * whenever the pending selection changes, so every checkbox toggle updates it.
 */
export function usePendingBudgetPreview(
  pending: Parameters<typeof previewSkillBudget>[0] | null,
  context: { app: App; settings: VerbexSettings; messages: ChatMessage[] },
): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null)
  const { app, settings, messages } = context
  useEffect(() => {
    if (!pending) {
      setPreview(null)
      return undefined
    }
    let live = true
    void previewSkillBudget(pending, {
      settings,
      messages,
      contextType: contextTypeFromExtension(
        app.workspace.getActiveFile()?.extension,
      ),
      isPluginEnabled: (id) => pluginIsEnabled(app, id),
    })
      .then((next) => {
        if (live) setPreview(next)
      })
      .catch(() => {
        if (live) setPreview(null)
      })
    return () => {
      live = false
    }
  }, [pending, app, settings, messages])
  return preview
}
