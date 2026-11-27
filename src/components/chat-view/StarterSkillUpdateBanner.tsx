import { type App, Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import {
  type OutdatedStarterSkill,
  closedAfterClosingSkills,
  findOutdatedStarterSkills,
  unclosedStarterSkills,
} from '../../verbex/starterSkillUpdates'

/**
 * Chat notice for default Skills that are unedited old copies while the
 * plugin ships a newer edition. Replacing goes through the normal Diff
 * approval, one file at a time; closing is remembered per bundled edition.
 */
export function StarterSkillUpdateBanner({
  app,
  plugin,
  settings,
  runId,
}: {
  app: App
  plugin: VerbexPlugin
  settings: VerbexSettings
  runId: string
}) {
  const [items, setItems] = useState<OutdatedStarterSkill[]>([])
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const { skillsFolder, workflowsFolder, promptsFolder } = settings

  useEffect(
    () => plugin.onStarterAssetsInstalled(() => setRefresh((n) => n + 1)),
    [plugin],
  )

  useEffect(() => {
    let stale = false
    void findOutdatedStarterSkills(app, {
      skillsFolder,
      workflowsFolder,
      promptsFolder,
    })
      .then((value) => {
        if (!stale) setItems(value)
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [app, skillsFolder, workflowsFolder, promptsFolder, refresh])

  const shown = unclosedStarterSkills(items, settings.starterSkillUpdatesClosed)

  const replace = useCallback(async () => {
    setBusy(true)
    try {
      const result = await plugin.verbexController.replaceStarterSkills({
        runId,
        folders: { skillsFolder, workflowsFolder, promptsFolder },
        items: shown,
      })
      new Notice(t('ui.StarterAssets.updateDone', result))
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setRefresh((n) => n + 1)
    }
  }, [plugin, runId, shown, skillsFolder, workflowsFolder, promptsFolder])

  if (shown.length === 0) return null
  const names = [...new Set(shown.map((item) => item.skill))]
  return (
    <div className="verbex-starter-assets-banner">
      <span className="verbex-starter-assets-banner-text">
        {t('ui.StarterAssets.updateBanner', {
          count: names.length,
          names: names.join(', '),
        })}
      </span>
      <button disabled={busy} onClick={() => void replace()}>
        {t('ui.StarterAssets.updateReplace')}
      </button>
      <button
        className="clickable-icon"
        aria-label={t('ui.StarterAssets.updateClose')}
        onClick={() =>
          void plugin.setSettings({
            ...plugin.settings,
            starterSkillUpdatesClosed: closedAfterClosingSkills(
              plugin.settings.starterSkillUpdatesClosed,
              shown,
            ),
          })
        }
      >
        ×
      </button>
    </div>
  )
}
