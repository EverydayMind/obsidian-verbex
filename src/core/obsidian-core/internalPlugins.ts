// The only place that touches Obsidian's private `app.internalPlugins` API.
// When Obsidian ships a public API for core plugins, change only this file.
import type { App } from 'obsidian'

type InternalPlugins = {
  getEnabledPluginById?: (id: string) => unknown
  getPluginById?: (id: string) => { instance?: unknown } | undefined
}

const internalPluginsOf = (app: App): InternalPlugins | undefined =>
  (app as App & { internalPlugins?: InternalPlugins }).internalPlugins

/** Instance of an enabled core plugin, or null when absent or disabled. */
export function enabledCorePlugin(app: App, id: string): unknown {
  return internalPluginsOf(app)?.getEnabledPluginById?.(id) ?? null
}

/** Instance of a core plugin even when it is turned off (settings readable). */
export function corePluginInstanceEvenIfDisabled(
  app: App,
  id: string,
): unknown {
  return internalPluginsOf(app)?.getPluginById?.(id)?.instance
}
