import { t } from '../i18n'

import {
  type CatalogTool,
  TOOL_APPROVAL_LABELS,
  TOOL_SOURCE_LABELS,
  type ToolApprovalState,
  type ToolSourceKind,
} from './catalogTypes'

export type ToolGrouping = 'plugin' | 'approval'
export type CatalogGroup = { key: string; title: string; tools: CatalogTool[] }

export function groupCatalog(
  tools: readonly CatalogTool[],
  options: {
    grouping: ToolGrouping
    source: ToolSourceKind | 'all'
    approval: ToolApprovalState | 'all'
    query: string
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
    const key =
      options.grouping === 'plugin'
        ? `${tool.sourceKind}:${tool.pluginId ?? tool.providerId}`
        : tool.approval
    const title =
      options.grouping === 'plugin'
        ? `${tool.providerId} · ${TOOL_SOURCE_LABELS[tool.sourceKind]}${tool.sourceKind === 'plugin' ? (tool.pluginState === 'missing' ? t('ui.catalogView.notInstalled') : tool.pluginState === 'disabled' ? t('ui.catalogView.disabled') : '') : ''}`
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
