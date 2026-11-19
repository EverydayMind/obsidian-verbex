import type { App } from 'obsidian'

import { readManifestName } from './pendingPluginApprovals'
import { NATIVE_TOOL_PREFIX } from './protocol'

/**
 * Display-only plugin naming. Nothing here may reach the model, settings
 * keys or tool ids: the raw plugin id stays the identity everywhere else.
 */
function clean(value: string | undefined): string | undefined {
  const text = value?.replace(/\p{Cc}/gu, '').trim()
  return text ? text : undefined
}

/** Name only; the id when the name is missing or equals the id. */
export function formatPluginName(id: string, name?: string): string {
  const shown = clean(name)
  return shown && shown !== id ? shown : id
}

/** `Name (id)`; the id once when the name is missing or equals the id. */
export function formatPluginLabel(id: string, name?: string): string {
  const shown = formatPluginName(id, name)
  return shown === id ? id : `${shown} (${id})`
}

function manifestName(app: App, id: string): string | undefined {
  try {
    return clean(readManifestName(app, id))
  } catch {
    return undefined
  }
}

/** `fallbackName` (for example the descriptor name) is used when no manifest name exists. */
export function pluginDisplayName(
  app: App,
  id: string,
  fallbackName?: string,
): string {
  return formatPluginName(id, manifestName(app, id) ?? fallbackName)
}

export function pluginLabelWithId(
  app: App,
  id: string,
  fallbackName?: string,
): string {
  return formatPluginLabel(id, manifestName(app, id) ?? fallbackName)
}

/** Row/modal title for a discovered plugin: `Name (id)` using the descriptor name as fallback. */
export function statusPluginLabel(
  app: App,
  status: { providerId: string; descriptor?: { provider: { name: string } } },
): string {
  return pluginLabelWithId(
    app,
    status.providerId,
    status.descriptor?.provider.name,
  )
}

/** Notice text only: swaps the raw plugin id for its name; the model-visible text is untouched. */
export function textWithPluginName(
  getApp: () => App,
  id: unknown,
  text: string,
): string {
  if (typeof id !== 'string' || !id) return text
  try {
    return text.split(id).join(pluginDisplayName(getApp(), id))
  } catch {
    return text
  }
}

/** `plg__<id>__<tool>` split for display; undefined for any other tool name. */
export function splitNativeToolName(
  name: string,
): { id: string; tool: string } | undefined {
  if (!name.startsWith(NATIVE_TOOL_PREFIX)) return undefined
  const rest = name.slice(NATIVE_TOOL_PREFIX.length)
  const cut = rest.indexOf('__')
  if (cut <= 0 || cut + 2 >= rest.length) return undefined
  return { id: rest.slice(0, cut), tool: rest.slice(cut + 2) }
}

/** `HWPX Exporter · export_note` for a native tool name, else the name itself. */
export function toolCardLabel(app: App, name: string): string {
  const parts = splitNativeToolName(name)
  return parts ? `${pluginDisplayName(app, parts.id)} · ${parts.tool}` : name
}
