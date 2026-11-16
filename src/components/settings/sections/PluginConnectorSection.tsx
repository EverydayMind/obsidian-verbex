import { App } from 'obsidian'
import { useEffect, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { ConnectorManifest } from '../../../provider/connectors/manifestSchema'
import { ConnectorStatus } from '../../../provider/connectors/PluginConnectorHost'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { PluginConnectorReviewModal } from '../modals/PluginConnectorReviewModal'

import { PluginApiPresets } from './PluginApiPresets'

export function PluginConnectorSection({
  app,
  plugin,
}: {
  app: App
  plugin: VerbexPlugin
}) {
  const { settings, setSettings } = useSettings()
  const [statuses, setStatuses] = useState<ConnectorStatus[]>([])
  const [exported, setExported] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        await plugin.pluginConnectorHost.refresh()
        if (active) setStatuses(plugin.pluginConnectorHost.getStatuses())
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : t('ui.PluginConnectorSection.couldNotCheckStatus'),
          )
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, 3000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [plugin, settings.pluginConnectors])
  const update = (
    id: string,
    transform: (manifest: ConnectorManifest) => ConnectorManifest,
  ) => {
    void setSettings({
      ...settings,
      pluginConnectors: {
        connectors: settings.pluginConnectors.connectors.map((manifest) =>
          manifest.id === id ? transform(manifest) : manifest,
        ),
      },
    })
  }
  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('ui.PluginConnectorSection.obsidianPluginAPI')}
      </div>
      <p>{t('ui.PluginConnectorSection.connectReadAndCalculationAPIsToThe')}</p>
      <PluginApiPresets app={app} plugin={plugin} />
      <details>
        <summary>
          {t('ui.PluginConnectorSection.advancedImportCustomDefinitions')}
        </summary>
        <button
          onClick={() => new PluginConnectorReviewModal(app, plugin).open()}
        >
          {t('ui.PluginConnectorSection.importJSON')}
        </button>
      </details>
      {settings.pluginConnectors.connectors.map((manifest) => (
        <div key={manifest.id} className="verbex-mcp-server">
          <div>
            <strong>{manifest.id}</strong> ·{' '}
            {statuses.find((status) => status.id === manifest.id)?.status ??
              t('ui.PluginConnectorSection.checkingStatus')}
          </div>
          <label>
            {t('ui.PluginConnectorSection.enableConnector')}{' '}
            <ObsidianToggle
              value={manifest.enabled}
              onChange={(enabled) =>
                update(manifest.id, (entry) => ({ ...entry, enabled }))
              }
            />
          </label>
          <button
            onClick={() =>
              new PluginConnectorReviewModal(app, plugin, manifest).open()
            }
          >
            {t('ui.PluginConnectorSection.reviewReapprove')}
          </button>
          <button
            onClick={() =>
              setExported(
                JSON.stringify(
                  { ...manifest, approved: undefined, enabled: false },
                  null,
                  2,
                ),
              )
            }
          >
            {t('ui.PluginConnectorSection.exportJSON')}
          </button>
          <button
            onClick={() => {
              void setSettings({
                ...settings,
                pluginConnectors: {
                  connectors: settings.pluginConnectors.connectors.filter(
                    (entry) => entry.id !== manifest.id,
                  ),
                },
              })
            }}
          >
            {t('ui.PluginConnectorSection.removeRegistration')}
          </button>
          {manifest.tools.map((tool) => (
            <details key={tool.name}>
              <summary>
                {tool.name} · {tool.effect} · {tool.method}
              </summary>
              <p>{tool.description}</p>
              <label>
                {t('ui.PluginConnectorSection.enableTool')}{' '}
                <ObsidianToggle
                  value={!tool.options.disabled}
                  onChange={(enabled) =>
                    update(manifest.id, (entry) => ({
                      ...entry,
                      tools: entry.tools.map((candidate) =>
                        candidate.name === tool.name
                          ? {
                              ...candidate,
                              options: {
                                ...candidate.options,
                                disabled: !enabled,
                              },
                            }
                          : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                {t('ui.PluginConnectorSection.allowAgentCalls')}{' '}
                <ObsidianToggle
                  value={tool.options.agentCallable}
                  onChange={(agentCallable) =>
                    update(manifest.id, (entry) => ({
                      ...entry,
                      tools: entry.tools.map((candidate) =>
                        candidate.name === tool.name
                          ? {
                              ...candidate,
                              options: { ...candidate.options, agentCallable },
                            }
                          : candidate,
                      ),
                    }))
                  }
                />
              </label>
              <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
            </details>
          ))}
        </div>
      ))}
      {exported && (
        <label>
          {t('ui.PluginConnectorSection.copyTheJSONToExport')}
          <textarea
            readOnly
            value={exported}
            rows={12}
            style={{ width: '100%' }}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
