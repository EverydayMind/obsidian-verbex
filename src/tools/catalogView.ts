import { t } from '../i18n'
import {
  formatPluginLabel,
  formatPluginName,
} from '../provider/interop/pluginDisplayName'

import {
  type CatalogTool,
  KORDOC_BUILTIN_GROUP,
  TOOL_APPROVAL_LABELS,
  TOOL_SOURCE_LABELS,
  type ToolApprovalState,
  type ToolSourceKind,
} from './catalogTypes'

export type ToolGrouping = 'plugin' | 'approval'
export type CatalogGroup = { key: string; title: string; tools: CatalogTool[] }

/**
 * Display only: tool names and settings keys keep using the raw ids.
 * `withId` gives `Name (id)`; otherwise the name alone (compact places).
 */
export function catalogProviderLabel(
  tool: CatalogTool,
  pluginName: ((id: string) => string | undefined) | undefined,
  withId: boolean,
): string {
  if (tool.sourceKind !== 'plugin' || tool.providerId === KORDOC_BUILTIN_GROUP)
    return tool.providerId
  const id = tool.pluginId ?? tool.providerId
  const name = pluginName?.(id)
  const label = withId
    ? formatPluginLabel(id, name)
    : formatPluginName(id, name)
  return label === id ? tool.providerId : label
}

function groupLabel(
  tool: CatalogTool,
  pluginName?: (id: string) => string | undefined,
): string {
  return tool.sourceKind === 'plugin' &&
    tool.providerId === KORDOC_BUILTIN_GROUP
    ? t('ui.catalogView.kordocBuiltIn')
    : catalogProviderLabel(tool, pluginName, true)
}

/** Built-in KORDOC tools share a plugin id with the real plugin but form their own group. */
function groupKey(tool: CatalogTool): string {
  if (tool.sourceKind === 'plugin' && tool.providerId === KORDOC_BUILTIN_GROUP)
    return `plugin:${KORDOC_BUILTIN_GROUP}`
  return `${tool.sourceKind}:${tool.pluginId ?? tool.providerId}`
}

export function groupCatalog(
  tools: readonly CatalogTool[],
  options: {
    grouping: ToolGrouping
    source: ToolSourceKind | 'all'
    approval: ToolApprovalState | 'all'
    query: string
    /** Obsidian manifest display name for a plugin folder id, if known. */
    pluginName?: (id: string) => string | undefined
  },
): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>()
  const query = options.query.trim().toLocaleLowerCase()
  for (const tool of tools) {
    if (options.source !== 'all' && tool.sourceKind !== options.source) continue
    if (options.approval !== 'all' && tool.approval !== options.approval)
      continue
    if (
      !`${tool.title} ${tool.name} ${tool.providerId} ${tool.pluginId ?? ''} ${tool.description}`
        .toLocaleLowerCase()
        .includes(query)
    )
      continue
    // Include the source so a server and a plugin with the same ID stay separate.
    const key = options.grouping === 'plugin' ? groupKey(tool) : tool.approval
    const title =
      options.grouping === 'plugin'
        ? `${groupLabel(tool, options.pluginName)} · ${TOOL_SOURCE_LABELS[tool.sourceKind]}${tool.sourceKind === 'plugin' ? (tool.pluginState === 'missing' ? t('ui.catalogView.notInstalled') : tool.pluginState === 'disabled' ? t('ui.catalogView.disabled') : '') : ''}`
        : TOOL_APPROVAL_LABELS[tool.approval]
    const group = groups.get(key) ?? { key, title, tools: [] }
    group.tools.push(tool)
    groups.set(key, group)
  }
  const approvalOrder = Object.keys(TOOL_APPROVAL_LABELS)
  return [...groups.values()].sort((a, b) =>
    options.grouping === 'approval'
      ? approvalOrder.indexOf(a.key) - approvalOrder.indexOf(b.key)
      : a.title.localeCompare(b.title, 'ko'),
  )
}
