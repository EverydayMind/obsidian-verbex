import type { App } from 'obsidian'
import { useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import { readManifestName } from '../../../provider/interop/pendingPluginApprovals'
import {
  TOOL_SOURCE_LABELS,
  ToolApprovalState,
  ToolSourceKind,
  catalogCounts,
} from '../../../tools/catalogTypes'
import { ToolGrouping, groupCatalog } from '../../../tools/catalogView'
import { useToolCatalog } from '../../../tools/useToolCatalog'
import { ToolCatalogControls } from '../../common/ToolCatalogControls'

import { McpSection } from './McpSection'
import { NativeProviderSection } from './NativeProviderSection'
import { PluginConnectorSection } from './PluginConnectorSection'
import { ToolGroupTable } from './ToolGroupTable'

export function ToolManagementSection({
  app,
  plugin,
  handlesSettingsFocus = true,
}: {
  app: App
  plugin: VerbexPlugin
  /** False outside the settings tab, so a "Review" jump is left for the tab. */
  handlesSettingsFocus?: boolean
}) {
  const { settings, setSettings } = useSettings()
  const { tools, servers, error } = useToolCatalog(app, plugin, settings)
  const [filter, setFilter] = useState<ToolSourceKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [grouping, setGrouping] = useState<ToolGrouping>('plugin')
  const [approval, setApproval] = useState<ToolApprovalState | 'all'>('all')
  const counts = catalogCounts(tools)
  const pluginName = (id: string) => readManifestName(app, id)
  const groups = groupCatalog(tools, {
    grouping,
    source: filter,
    approval,
    query,
    pluginName,
  })
  return (
    <section className="verbex-settings-section verbex-tool-management">
      <h2 className="verbex-settings-header">
        {t('ui.ToolManagementSection.toolManagement')}
      </h2>
      <p>
        {t('ui.ToolManagementSection.registered')}
        {counts.registered} {t('ui.ToolManagementSection.ready')}
        {counts.ready} {t('ui.ToolManagementSection.agentCandidates')}{' '}
        {counts.candidates}
      </p>
      <p>
        {t('ui.ToolManagementSection.lastSuccessfulModelRequestExposure')}{' '}
        {plugin.toolProviderHub?.lastExposure?.names.length ??
          t('ui.ToolManagementSection.noneYet')}
      </p>
      <p className="verbex-settings-desc">
        {t('ui.ToolManagementSection.toolsActuallySentToTheModelDepend')}
      </p>
      <h3 data-verbex-section="tool-approval">
        {t('ui.ToolManagementSection.toolApproval')}
      </h3>
      <NativeProviderSection
        plugin={plugin}
        handlesSettingsFocus={handlesSettingsFocus}
      />
      <div
        className="verbex-tool-filters"
        role="group"
        aria-label={t('ui.ToolManagementSection.toolCategory')}
      >
        {(['all', 'builtin', 'plugin', 'mcp'] as const).map((kind) => (
          <button
            key={kind}
            aria-pressed={filter === kind}
            onClick={() => setFilter(kind)}
          >
            {kind === 'all'
              ? t('ui.ToolManagementSection.all')
              : TOOL_SOURCE_LABELS[kind]}
          </button>
        ))}
      </div>
      <ToolCatalogControls
        grouping={grouping}
        approval={approval}
        onGroupingChange={setGrouping}
        onApprovalChange={setApproval}
      />
      <input
        type="search"
        aria-label={t('ui.ToolManagementSection.searchTools')}
        placeholder={t(
          'ui.ToolManagementSection.searchCapabilitiesAndProviders',
        )}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <label className="verbex-tool-global-toggle">
        <input
          type="checkbox"
          checked={settings.chatOptions.enableTools}
          onChange={(event) => {
            void setSettings({
              ...settings,
              chatOptions: {
                ...settings.chatOptions,
                enableTools: event.target.checked,
              },
            })
          }}
        />{' '}
        {t('ui.ToolManagementSection.enableToolsForChatAgent')}
      </label>
      <p role="status">
        {t('ui.ToolManagementSection.showing')}
        {groups.reduce((sum, group) => sum + group.tools.length, 0)}
        {t('ui.ToolManagementSection.tools')} {groups.length}
        {t('ui.ToolManagementSection.groups')}
      </p>
      {groups.map((group) => (
        <details key={`${grouping}:${group.key}`} className="verbex-tool-group">
          <summary>
            {group.title} · {group.tools.length}
            {t('ui.ToolManagementSection.tools2')}
          </summary>
          <ToolGroupTable group={group} pluginName={pluginName} />
        </details>
      ))}
      {groups.length === 0 && (
        <p>{t('ui.ToolManagementSection.noMatchingTools')}</p>
      )}
      {(filter === 'all' || filter === 'plugin') && (
        <details>
          <summary>{t('ui.ToolManagementSection.addPluginAPI')}</summary>
          <PluginConnectorSection app={app} plugin={plugin} />
        </details>
      )}
      {(filter === 'all' || filter === 'mcp') && (
        <details>
          <summary>
            {t('ui.ToolManagementSection.manageMCPServersAndPermissions')}
          </summary>
          {servers.length === 0 && (
            <p>{t('ui.ToolManagementSection.noMCPServersRegistered')}</p>
          )}
          <McpSection app={app} plugin={plugin} searchQuery={query} />
        </details>
      )}
      {(filter === 'all' || filter === 'builtin') && (
        <p>{t('ui.ToolManagementSection.manageVaultSearchOnSearchTab')}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
