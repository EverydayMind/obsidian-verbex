import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { looksUnprovisioned } from '../../verbex/starterAssets'

/**
 * Chat-side notice for a new install, or a reinstall after the folders were
 * removed: the default skills are not there yet and can be installed.
 */
export function StarterAssetsBanner({
  app,
  plugin,
  settings,
}: {
  app: App
  plugin: VerbexPlugin
  settings: VerbexSettings
}) {
  const [missing, setMissing] = useState(false)
  const [installs, setInstalls] = useState(0)
  const { skillsFolder, workflowsFolder, promptsFolder } = settings
  const dismissed = settings.starterAssetsDismissed

  // An install from anywhere (this notice, the command, another chat view).
  useEffect(
    () => plugin.onStarterAssetsInstalled(() => setInstalls((n) => n + 1)),
    [plugin],
  )

  useEffect(() => {
    if (dismissed) return
    let stale = false
    void looksUnprovisioned(app, {
      skillsFolder,
      workflowsFolder,
      promptsFolder,
    })
      .then((value) => {
        if (!stale) setMissing(value)
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [app, dismissed, skillsFolder, workflowsFolder, promptsFolder, installs])

  if (dismissed || !missing) return null
  return (
    <div className="verbex-starter-assets-banner">
      <span className="verbex-starter-assets-banner-text">
        {t('ui.StarterAssets.banner')}
      </span>
      <button onClick={() => plugin.openStarterAssets()}>
        {t('ui.StarterAssets.choose')}
      </button>
      <button
        className="clickable-icon"
        aria-label={t('ui.StarterAssets.dismiss')}
        onClick={() =>
          void plugin.setSettings({
            ...plugin.settings,
            starterAssetsDismissed: true,
          })
        }
      >
        ×
      </button>
    </div>
  )
}
