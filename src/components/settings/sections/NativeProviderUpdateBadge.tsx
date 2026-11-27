import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import {
  type CompatibilityNotice,
  collectCompatibilityNotices,
  hostOutdatedProviders,
} from '../../../provider/interop/compatibilityNotices'
import {
  compatibilityBadge,
  compatibilityLine,
} from '../../chat-view/compatibilityText'

/** "Update required / recommended" with the reason, under a plugin in the provider list. */
export function NativeProviderUpdateBadge({
  plugin,
  providerId,
}: {
  plugin: VerbexPlugin
  providerId: string
}) {
  let notices: CompatibilityNotice[] = []
  try {
    notices = collectCompatibilityNotices(
      plugin.app,
      hostOutdatedProviders(plugin.nativeProviderHost),
      plugin.settings.pluginConnectors.connectors,
    ).filter((notice) => notice.pluginId === providerId)
  } catch {
    // Advisory only.
  }
  if (notices.length === 0) return null
  return (
    <div className="verbex-compat-badges">
      {notices.map((notice) => (
        <p
          key={notice.key}
          className={notice.severity === 'required' ? 'mod-warning' : undefined}
        >
          <strong>{compatibilityBadge(notice)}</strong>{' '}
          {compatibilityLine(notice)} {t('ui.Compatibility.howTo')}
        </p>
      ))}
    </div>
  )
}
