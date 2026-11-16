import type { App } from 'obsidian'

import { noteComposer } from '../core/tidy/noteComposerPort'
import { TOOL_REGISTRY, getToolCatalog } from '../core/tools/toolDefinitions'
import { t } from '../i18n'
import { getDataviewAPI } from '../utils/dataview'

import type { CatalogTool } from './catalogTypes'
import { UI_NATIVE_TOOL_TITLES } from './nativeToolTitles'

const DATAVIEW_TOOLS = new Set(['dataview_query', 'render_dataview'])

export function nativeToolReady(app: App, name: string): boolean {
  if (TOOL_REGISTRY[name]?.requiresNoteComposer)
    return noteComposer(app) !== null
  return (
    !DATAVIEW_TOOLS.has(name) ||
    typeof getDataviewAPI(app)?.queryMarkdown === 'function'
  )
}

export function nativeCatalog(app: App, toolsEnabled: boolean): CatalogTool[] {
  return Object.entries(getToolCatalog().registry).flatMap(
    ([name, metadata]) => {
      if (!metadata.definition) return []
      const plugin = DATAVIEW_TOOLS.has(name)
      const composer = metadata.requiresNoteComposer === true
      const ready = nativeToolReady(app, name)
      return [
        {
          name,
          title: UI_NATIVE_TOOL_TITLES[name] ?? name.replace(/_/g, ' '),
          description: metadata.definition.function.description ?? '',
          sourceKind: plugin || composer ? 'plugin' : 'builtin',
          providerId: plugin
            ? 'Dataview'
            : composer
              ? 'Note Composer'
              : 'Verbex',
          pluginId: plugin
            ? 'dataview'
            : composer
              ? 'note-composer'
              : undefined,
          providerKind: plugin ? 'community' : composer ? 'core' : 'builtin',
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
            ? composer
              ? t('ui.nativeCatalog.settingsCorePluginsEnableNoteComposer')
              : t('ui.nativeCatalog.installAndEnableDataview')
            : undefined,
          definition: metadata.definition,
        },
      ]
    },
  )
}
