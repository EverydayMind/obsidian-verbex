import type { App } from 'obsidian'

import { pluginState } from '../provider/interop/discovery'

import type { CatalogTool } from './catalogTypes'

const CORE_PLUGIN_IDS = new Set(['note-composer'])

export function catalogPluginState(
  app: App,
  tool: Pick<CatalogTool, 'pluginId' | 'providerId' | 'providerKind'>,
): 'enabled' | 'disabled' | 'missing' {
  const id = tool.pluginId ?? tool.providerId
  if (tool.providerKind === 'core' || CORE_PLUGIN_IDS.has(id)) {
    const internal = (
      app as App & {
        internalPlugins?: {
          getEnabledPluginById?: (pluginId: string) => unknown
        }
      }
    ).internalPlugins
    return internal?.getEnabledPluginById?.(id) ? 'enabled' : 'disabled'
  }
  return pluginState(app, id)
}
