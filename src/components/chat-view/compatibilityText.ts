import { t } from '../../i18n'
import type { CompatibilityNotice } from '../../provider/interop/compatibilityNotices'

/** The sentence for one notice. A table key that has no text falls back to the feature. */
export function compatibilityLine(notice: CompatibilityNotice): string {
  if (notice.kind === 'host')
    return t('ui.Compatibility.hostLine', { name: notice.name })
  if (notice.kind === 'bridge' && notice.connectorId !== undefined)
    return t('ui.Compatibility.bridgeConnector', {
      name: notice.name,
      connector: notice.connectorId,
    })
  if (notice.kind === 'bridge') return t(notice.messageKey ?? '')
  const own = notice.messageKey ? t(notice.messageKey) : ''
  const change =
    own && own !== notice.messageKey
      ? own
      : t(`ui.Compatibility.feature.${notice.feature ?? ''}`)
  return t('ui.Compatibility.pluginLine', {
    name: notice.name,
    installed: notice.installed ?? '',
    required: notice.required ?? '',
    change,
  })
}

export function compatibilityBadge(notice: CompatibilityNotice): string {
  return t(
    notice.severity === 'required'
      ? 'ui.Compatibility.badgeRequired'
      : 'ui.Compatibility.badgeRecommended',
  )
}
