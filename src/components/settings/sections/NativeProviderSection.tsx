import { useEffect, useRef, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { useWebHandsEnabled } from '../../../hooks/useWebHandsEnabled'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { NativeProviderStatus } from '../../../provider/interop/NativeProviderHost'
import { ObsidianToggle } from '../../common/ObsidianToggle'

import { NativeArtifactControls } from './NativeArtifactControls'
import { NativeCommitGrantControls } from './NativeCommitGrantControls'
import { NativeProviderDefinition } from './NativeProviderDefinition'
import {
  NativeDuplicateApprovalWarning,
  NativeReapprovalReview,
  NativeRevokeApprovalButton,
} from './NativeReapprovalReview'
import { NativeSequentialApproval } from './NativeSequentialApproval'
import { useNativeBatchApproval } from './useNativeBatchApproval'
/** Self-exposed plugin tools: found by discovery, usable only after approval. */
export function NativeProviderSection({ plugin }: { plugin: VerbexPlugin }) {
  const { settings, setSettings } = useSettings()
  const webHandsEnabled = useWebHandsEnabled(plugin.app)
  const [statuses, setStatuses] = useState<NativeProviderStatus[]>([])
  const [error, setError] = useState('')
  const [discoveryError, setDiscoveryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [connectorIds, setConnectorIds] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const [focusRevision, setFocusRevision] = useState(0)
  useEffect(
    () => plugin.onSettingsFocus?.(() => setFocusRevision((n) => n + 1)),
    [plugin],
  )
  useEffect(() => {
    const focus = plugin.peekSettingsFocus?.()
    if (loading || !focus || focus.section !== 'tool-approval') return
    const target = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-provider-id]') ??
        [],
    ).find((el) => el.dataset.providerId === focus.providerId)
    const details = target?.querySelector('details')
    if (details) details.open = true
    const destination =
      target ??
      rootRef.current
        ?.closest('.verbex-tool-management')
        ?.querySelector<HTMLElement>('[data-verbex-section="tool-approval"]')
    destination?.scrollIntoView?.({ block: 'start' })
    plugin.clearSettingsFocus()
  }, [plugin, loading, statuses, focusRevision])
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
      const next = plugin.nativeProviderHost.getStatuses()
      setStatuses(next)
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
  const approvals = settings.nativeProviders.providers
  return (
    <div className="verbex-settings-section" ref={rootRef}>
      <div className="verbex-settings-header">
        {t('ui.NativeProviderSection.toolsExposedByPlugins')}
      </div>
      <NativeSequentialApproval
        plugin={plugin}
        statuses={statuses}
        setSettings={setSettings}
      />
      <p>
        {t('ui.NativeProviderSection.toolsExposedByEnabledPluginsAvailableTo')}
      </p>
      <p>
        {t(
          'ui.NativeProviderSection.optionalExecutableHashesCheckChangesToMain',
        )}
      </p>
      <p>
        {t(
          'ui.NativeProviderSection.openDocumentProtectionUsesDocumentListsFrom',
        )}
      </p>
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
        const matches = approvals.filter(
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
              <strong>
                {status.descriptor?.provider.name ?? status.providerId}
              </strong>{' '}
              · {status.providerId} v{status.pluginVersion} · {status.message}
            </div>
            <NativeDuplicateApprovalWarning count={matches.length} />
            {status.state === 'reapproval' && approval && (
              <NativeReapprovalReview status={status} approval={approval} />
            )}
            {status.descriptor && (
              <details>
                <summary>
                  {t('ui.NativeProviderSection.review')}
                  {status.descriptor.tools.length}
                  {t('ui.NativeProviderSection.tools')}
                </summary>
                <NativeProviderDefinition
                  status={status}
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
