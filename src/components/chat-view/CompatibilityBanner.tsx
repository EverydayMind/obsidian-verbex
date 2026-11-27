import type { App } from 'obsidian'

import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import {
  closedAfterClosing,
  visibleNotices,
} from '../../provider/interop/compatibilityNotices'
import type { VerbexSettings } from '../../settings/schema/setting.types'

import { compatibilityLine } from './compatibilityText'
import { useCompatibilityNotices } from './useCompatibilityNotices'

/**
 * Chat notice for sibling plugins that need an update (or a Verbex update).
 * A required notice stays until it is resolved; a recommended one can be
 * closed, and the closing is kept in the Verbex settings. Verbex never
 * installs or updates a plugin itself.
 */
export function CompatibilityBanner({
  app,
  plugin,
  settings,
}: {
  app: App
  plugin: VerbexPlugin
  settings: VerbexSettings
}) {
  const notices = useCompatibilityNotices(
    app,
    plugin,
    settings.pluginConnectors.connectors,
  )
  const closed = settings.compatibilityClosed
  const shown = visibleNotices(notices, closed)
  if (shown.length === 0) return null
  const closable = shown.filter((notice) => notice.severity === 'recommended')
  return (
    <div className="verbex-starter-assets-banner verbex-compat-banner">
      <span className="verbex-starter-assets-banner-text">
        {shown.map((notice) => (
          <div key={notice.key} data-severity={notice.severity}>
            {compatibilityLine(notice)}
          </div>
        ))}
        {shown.some((notice) => notice.kind !== 'bridge') && (
          <div>{t('ui.Compatibility.howTo')}</div>
        )}
      </span>
      {closable.length > 0 && (
        <button
          className="clickable-icon"
          aria-label={t('ui.Compatibility.dismiss')}
          onClick={() =>
            void plugin.setSettings({
              ...plugin.settings,
              compatibilityClosed: closedAfterClosing(
                notices,
                plugin.settings.compatibilityClosed,
                closable.map((notice) => notice.key),
              ),
            })
          }
        >
          ×
        </button>
      )}
    </div>
  )
}
