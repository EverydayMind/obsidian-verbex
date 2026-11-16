import { sameBrowserCapability } from './browserProtocol'
import {
  type PluginInstance,
  type ProviderHandle,
  readProviderHandle,
} from './discovery'

export function providerInstanceCurrent(
  handle: ProviderHandle,
  list: () => PluginInstance[],
): boolean {
  try {
    const plugin = list().find((item) => item.id === handle.pluginId)
    if (
      !plugin ||
      plugin.instance !== handle.plugin ||
      plugin.version !== handle.pluginVersion
    )
      return false
    const live = readProviderHandle(plugin)
    return (
      !!live &&
      live.protocolVersion === handle.protocolVersion &&
      sameBrowserCapability(live.browser, handle.browser) &&
      live.provider === handle.provider &&
      live.describe === handle.describe &&
      live.callTool === handle.callTool &&
      live.resolveTarget === handle.resolveTarget &&
      live.editor?.receiver === handle.editor?.receiver &&
      live.commit?.receiver === handle.commit?.receiver &&
      live.commit?.prepare === handle.commit?.prepare &&
      live.commit?.execute === handle.commit?.execute &&
      live.commit?.status === handle.commit?.status &&
      live.editor?.reveal === handle.editor?.reveal &&
      live.editor?.capture === handle.editor?.capture &&
      live.editor?.openDocuments === handle.editor?.openDocuments &&
      live.editor?.discardAgentChanges === handle.editor?.discardAgentChanges &&
      live.editor?.release === handle.editor?.release
    )
  } catch {
    return false
  }
}
