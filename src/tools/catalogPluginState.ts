import type { App } from 'obsidian'

import { CORE_PLUGIN_IDS } from '../core/obsidian-core/corePluginMeta'
import { enabledCorePlugin } from '../core/obsidian-core/internalPlugins'
import { pluginState } from '../provider/interop/discovery'

import type { CatalogTool } from './catalogTypes'

export function catalogPluginState(
  app: App,
  tool: Pick<CatalogTool, 'pluginId' | 'providerId' | 'providerKind'>,
): 'enabled' | 'disabled' | 'missing' {
  const id = tool.pluginId ?? tool.providerId
  if (tool.providerKind === 'core' || CORE_PLUGIN_IDS.has(id)) {
    return enabledCorePlugin(app, id) ? 'enabled' : 'disabled'
  }
  return pluginState(app, id)
}
