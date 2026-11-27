import { useEffect, useRef, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { useWebHandsEnabled } from '../../../hooks/useWebHandsEnabled'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { displayReaderFor } from '../../../provider/interop/hostCapabilities/skillDisplayRead'
import { NativeProviderStatus } from '../../../provider/interop/NativeProviderHost'
import { statusPluginLabel } from '../../../provider/interop/pluginDisplayName'
import { ObsidianToggle } from '../../common/ObsidianToggle'

import { NativeApprovalExplanation } from './NativeApprovalExplanation'
import { NativeArtifactControls } from './NativeArtifactControls'
import { NativeCommitGrantControls } from './NativeCommitGrantControls'
import { NativeDisabledSaveToolNotice } from './NativeDisabledSaveToolNotice'
import { NativeProviderDefinition } from './NativeProviderDefinition'
import { NativeProviderPrivacyWarning } from './NativeProviderPrivacyWarning'
import { NativeProviderUpdateBadge } from './NativeProviderUpdateBadge'
import {
  NativeDuplicateApprovalWarning,
  NativeReapprovalReview,
  NativeRevokeApprovalButton,
} from './NativeReapprovalReview'
import { NativeSequentialApproval } from './NativeSequentialApproval'
import { useNativeBatchApproval } from './useNativeBatchApproval'
import { useSettingsFocusScroll } from './useSettingsFocusScroll'
type Props = { plugin: VerbexPlugin; handlesSettingsFocus?: boolean }
/** Self-exposed plugin tools: found by discovery, usable only after approval. */
export function NativeProviderSection({ plugin, ...rest }: Props) {
  const ownsFocus = rest.handlesSettingsFocus !== false
  const { settings, setSettings } = useSettings()
  const webHandsEnabled = useWebHandsEnabled(plugin.app)
  const [statuses, setStatuses] = useState<NativeProviderStatus[]>([])
  const [error, setError] = useState('')
  const [discoveryError, setDiscoveryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [connectorIds, setConnectorIds] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  useEffect(() => {
    const bump = () => setFocusRevision((n) => n + 1)
    return ownsFocus ? plugin.onSettingsFocus?.(bump) : undefined
  }, [plugin, ownsFocus])
  useSettingsFocusScroll({
    plugin,
    ownsFocus,
    loading,
    rootRef,
    statuses,
    focusRevision,
  })
  const { approveOne, revoke, update } = useNativeBatchApproval(
    plugin,
    setSettings,
    setError,
  )
  useEffect(() => {
    let active = true
    let refreshing = false
    const publish = () => {
      if (!active) return
      setStatuses(plugin.nativeProviderHost.getStatuses())
      setConnectorIds(
        plugin.pluginConnectorHost
          .getEntries()
          .map((entry) => entry.manifest.id),
      )
    }
    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      try {
        await Promise.all([
          plugin.nativeProviderHost.refresh(),
          plugin.pluginConnectorHost.refresh(),
        ])
        publish()
        if (active) setDiscoveryError('')
      } catch (cause) {
        if (active)
          setDiscoveryError(
            cause instanceof Error
              ? cause.message
              : t('ui.NativeProviderSection.toolDiscoveryFailed'),
          )
      } finally {
        refreshing = false
        if (active) setLoading(false)
      }
    }
    setLoading(true)
    void refresh()
    const timer = window.setInterval(() => void refresh(), 3000)
    // Discovery is already complete. Do not launch another scan from its notice.
    const detach = plugin.nativeProviderHost.onReady(publish)
    return () => {
      active = false
      window.clearInterval(timer)
      detach()
    }
  }, [plugin, settings.nativeProviders, settings.pluginConnectors])
  return (
    <div className="verbex-settings-section" ref={rootRef}>
      <h2 className="verbex-settings-header">
        {t('ui.NativeProviderSection.toolsExposedByPlugins')}
      </h2>
      <NativeSequentialApproval
        plugin={plugin}
        statuses={statuses}
        setSettings={setSettings}
      />
      <NativeApprovalExplanation />
      {webHandsEnabled && (
        <label>
          {t('ui.NativeProviderSection.allowBrowserActionsApproveEachCall')}
          <ObsidianToggle
            value={settings.nativeProviders.browserControl}
            onChange={(browserControl) =>
              void setSettings({
                ...settings,
                nativeProviders: {
                  ...settings.nativeProviders,
                  browserControl,
                },
              })
            }
          />
        </label>
      )}
      {error && <p className="mod-warning">{error}</p>}
      {discoveryError && <p role="alert">{discoveryError}</p>}
      {loading && (
        <p role="status">{t('ui.NativeProviderSection.checkingPluginTools')}</p>
      )}
      {!loading && !discoveryError && statuses.length === 0 && (
        <p>{t('ui.NativeProviderSection.noPluginsExposeTools')}</p>
      )}
      {statuses.map((status) => {
        const matches = settings.nativeProviders.providers.filter(
          (item) => item.providerId === status.providerId,
        )
        const approval = matches[0]
        const duplicate = matches.length > 1
        const reviewed = JSON.stringify(matches)
        return (
          <div
            key={status.providerId}
            className="verbex-mcp-server"
            data-provider-id={status.providerId}
          >
            <div>
              <strong>{statusPluginLabel(plugin.app, status)}</strong> v
              {status.pluginVersion} · {status.message}
            </div>
            <NativeProviderUpdateBadge
              plugin={plugin}
              providerId={status.providerId}
            />
            <NativeDuplicateApprovalWarning count={matches.length} />
            <NativeProviderPrivacyWarning
              app={plugin.app}
              providerId={status.providerId}
            />
            {status.state === 'reapproval' && approval && (
              <NativeReapprovalReview status={status} approval={approval} />
            )}
            {status.descriptor && (
              <details data-verbex-review>
                <summary>
                  {t('ui.NativeProviderSection.review')}
                  {status.descriptor.tools.length}
                  {t('ui.NativeProviderSection.tools')}
                </summary>
                <NativeProviderDefinition
                  status={status}
                  readSkillBody={displayReaderFor(
                    plugin.nativeProviderHost,
                    status,
                  )}
                  toolControls={(name) =>
                    approval &&
                    status.state === 'active' && (
                      <label>
                        {t('ui.NativeProviderSection.enableTool')}{' '}
                        <ObsidianToggle
                          value={!approval.disabledToolNames.includes(name)}
                          onChange={(enabled) =>
                            void update(
                              status.providerId,
                              reviewed,
                              (item) => ({
                                ...item,
                                disabledToolNames: enabled
                                  ? item.disabledToolNames.filter(
                                      (itemName) => itemName !== name,
                                    )
                                  : [...item.disabledToolNames, name],
                              }),
                            )
                          }
                        />
                      </label>
                    )
                  }
                />
                {(status.state === 'pending' ||
                  status.state === 'reapproval') && (
                  <button onClick={() => void approveOne(status, approval)}>
                    {t(
                      'ui.NativeProviderSection.approveTheToolDefinitionsAbove',
                    )}
                  </button>
                )}
              </details>
            )}
            {status.state === 'active' &&
              settings.pluginConnectors.connectors
                .filter(
                  (connector) =>
                    connector.target.pluginId === status.providerId &&
                    connector.enabled &&
                    connectorIds.includes(connector.id),
                )
                .map((connector) => (
                  <p key={connector.id}>
                    {t('ui.NativeProviderSection.existingConnector')}
                    {connector.id}
                    {t(
                      'ui.NativeProviderSection.isAlsoEnabledDisableThisConnectorTo',
                    )}{' '}
                    <button
                      onClick={() =>
                        void setSettings({
                          ...settings,
                          pluginConnectors: {
                            connectors:
                              settings.pluginConnectors.connectors.map(
                                (item) =>
                                  item.id === connector.id
                                    ? { ...item, enabled: false }
                                    : item,
                              ),
                          },
                        })
                      }
                    >
                      {t('ui.NativeProviderSection.disableConnector')}
                    </button>
                  </p>
                ))}
            <NativeDisabledSaveToolNotice
              status={status}
              commitGrants={settings.nativeProviders.commitGrants}
            />
            <NativeCommitGrantControls plugin={plugin} status={status} />
            {approval && (
              <>
                {!duplicate && (
                  <NativeArtifactControls
                    plugin={plugin}
                    approval={approval}
                    active={status.state === 'active'}
                  />
                )}
                {!duplicate && status.state !== 'reapproval' && (
                  <label>
                    {t('ui.NativeProviderSection.enabled')}{' '}
                    <ObsidianToggle
                      value={approval.enabled}
                      onChange={(enabled) =>
                        void update(status.providerId, reviewed, (item) => ({
                          ...item,
                          enabled,
                        }))
                      }
                    />
                  </label>
                )}
                <NativeRevokeApprovalButton
                  duplicate={duplicate}
                  onClick={() => void revoke(status.providerId, reviewed)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
