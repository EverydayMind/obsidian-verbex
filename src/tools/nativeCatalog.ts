import type { App } from 'obsidian'

import { corePluginProviderId } from '../core/obsidian-core/corePluginMeta'
import { enabledCorePlugin } from '../core/obsidian-core/internalPlugins'
import { noteComposer } from '../core/tidy/noteComposerPort'
import { TOOL_REGISTRY, getToolCatalog } from '../core/tools/toolDefinitions'
import { t } from '../i18n'

import type { CatalogTool } from './catalogTypes'
import { UI_NATIVE_TOOL_TITLES } from './nativeToolTitles'

export function nativeToolReady(app: App, name: string): boolean {
  const pluginId = TOOL_REGISTRY[name]?.requiresCorePlugin
  if (!pluginId) return true
  if (pluginId === 'note-composer') return noteComposer(app) !== null
  return enabledCorePlugin(app, pluginId) !== null
}

export function nativeCatalog(app: App, toolsEnabled: boolean): CatalogTool[] {
  return Object.entries(getToolCatalog().registry).flatMap(
    ([name, metadata]) => {
      if (!metadata.definition) return []
      const pluginId = metadata.requiresCorePlugin
      const core = typeof pluginId === 'string' && pluginId.length > 0
      const providerId = core ? corePluginProviderId(pluginId) : 'Verbex'
      const ready = nativeToolReady(app, name)
      return [
        {
          name,
          title: UI_NATIVE_TOOL_TITLES[name] ?? name.replace(/_/g, ' '),
          description: metadata.definition.function.description ?? '',
          sourceKind: core ? 'plugin' : 'builtin',
          providerId,
          pluginId: core ? pluginId : undefined,
          providerKind: core ? 'core' : 'builtin',
          transport: 'inProcess',
          effects: metadata.category === 'read' ? ['read'] : ['vaultWrite'],
          enabled: toolsEnabled,
          ready,
          agentCallable: metadata.agentCallable,
          approval: 'notRequired',
          status: !ready
            ? t('ui.nativeCatalog.pluginNotInstalledDisabled')
            : metadata.agentCallable
              ? t('ui.nativeCatalog.available')
              : t('ui.nativeCatalog.workflowOnly'),
          action: !ready
            ? pluginId === 'note-composer'
              ? t('ui.nativeCatalog.settingsCorePluginsEnableNoteComposer')
              : t('ui.nativeCatalog.settingsCorePluginsEnable', {
                  plugin: providerId,
                })
            : undefined,
          definition: metadata.definition,
        },
      ]
    },
  )
}
