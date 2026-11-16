import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import { tasksConnectorPreset } from '../../../provider/connectors/presets'
import { apiPresets } from '../../../tools/apiPresets'
import { PluginConnectorReviewModal } from '../modals/PluginConnectorReviewModal'

export function PluginApiPresets({
  app,
  plugin,
}: {
  app: App
  plugin: VerbexPlugin
}) {
  const [selected, setSelected] = useState('tasks')
  const presets = apiPresets(
    app,
    plugin.providerRegistry
      ?.getAgentToolDefinitions()
      .map((tool) => tool.function.name) ?? [],
  )
  const preset = presets.find((entry) => entry.id === selected) ?? presets[0]
  const manifest = plugin.settings.pluginConnectors.connectors.find(
    (entry) => entry.id === 'tasks',
  )
  return (
    <div>
      <label>
        {t('ui.PluginApiPresets.supportedPresets')}{' '}
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {presets.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} · {entry.status}
            </option>
          ))}
        </select>
      </label>
      <p>{preset.description}</p>
      <button
        type="button"
        onClick={() => {
          if (preset.id === 'tasks')
            new PluginConnectorReviewModal(
              app,
              plugin,
              manifest ?? tasksConnectorPreset(),
            ).open()
          else
            new Notice(
              preset.ready
                ? t('ui.PluginApiPresets.aPIIsConnectedAutomaticallyPinItIn', {
                    p0: preset.title,
                  })
                : t(
                    'ui.PluginApiPresets.installAndEnableInObsidianSettingsCommunity',
                    { p0: preset.title },
                  ),
            )
        }}
      >
        {preset.id === 'tasks'
          ? manifest
            ? t('ui.PluginApiPresets.reviewReapprove')
            : t('ui.PluginApiPresets.addReviewTasks')
          : preset.ready
            ? t('ui.PluginApiPresets.checkConnectionStatus')
            : t('ui.PluginApiPresets.installationAndActivationHelp')}
      </button>
      <p className="setting-item-description">
        {t('ui.PluginApiPresets.installationAndActivationAreSeparateFromAPI')}
      </p>
    </div>
  )
}
