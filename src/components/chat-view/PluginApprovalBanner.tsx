import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { t } from '../../i18n'
import type VerbexPlugin from '../../main'
import type { NativeProviderStatus } from '../../provider/interop/hostScanTypes'

const dismissed = new Set<string>()

export function PluginApprovalBanner({
  plugin,
  app,
}: {
  plugin: VerbexPlugin
  app: App
}) {
  const [statuses, setStatuses] = useState<NativeProviderStatus[]>([])
  const [, rerender] = useState(0)
  useEffect(() => {
    let active = true
    const update = () => {
      if (active) setStatuses(plugin.nativeProviderHost.getStatuses())
    }
    const detach = plugin.nativeProviderHost.onStatusesChanged(update)
    void plugin.nativeProviderHost.refresh().then(update).catch(update)
    return () => {
      active = false
      detach()
    }
  }, [plugin])
  const pending = statuses.filter(
    (s) => s.state === 'pending' || s.state === 'reapproval',
  )
  const key = JSON.stringify(
    pending
      .map((s) => [s.providerId, s.state, s.pluginVersion])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  )
  if (!pending.length || dismissed.has(key)) return null
  const reapproval = pending.filter((s) => s.state === 'reapproval').length
  return (
    <div className="verbex-chat-model-readiness-banner">
      <span className="verbex-chat-model-readiness-banner-text">
        {t('ui.StatusViewRoot.approvalBanner', { count: pending.length })}
        {reapproval > 0 &&
          t('ui.StatusViewRoot.approvalBreakdown', {
            pending: pending.length - reapproval,
            reapproval,
          })}
      </span>
      <button
        onClick={() => {
          plugin.requestSettingsFocus({
            section: 'tool-approval',
            providerId: pending[0].providerId,
          })
          const settingsApp = app as App & {
            setting: { open(): void; openTabById(id: string): void }
          }
          settingsApp.setting.open()
          settingsApp.setting.openTabById('verbex')
        }}
      >
        {t('ui.StatusViewRoot.approvalReview')}
      </button>
      <button
        aria-label={t('ui.StatusViewRoot.approvalDismiss')}
        onClick={() => {
          dismissed.add(key)
          rerender((n) => n + 1)
        }}
      >
        ×
      </button>
    </div>
  )
}
