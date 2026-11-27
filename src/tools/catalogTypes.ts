import { t } from '../i18n'
import type { RequestTool } from '../types/llm/request'

export type ToolSourceKind = 'builtin' | 'plugin' | 'mcp'
export type ToolEffect = 'read' | 'sessionEdit' | 'vaultWrite' | 'externalCall'
export const TOOL_EFFECT_LABELS: Record<ToolEffect, string> = {
  read: t('ui.catalogTypes.read'),
  sessionEdit: t('ui.catalogTypes.editWorkingCopy'),
  vaultWrite: t('ui.catalogTypes.saveToVault'),
  externalCall: t('ui.catalogTypes.externalAction'),
}
export type ToolApprovalState =
  | 'approved'
  | 'pending'
  | 'reapproval'
  | 'perCall'
  | 'automatic'
  | 'notRequired'
  | 'unknown'

export const TOOL_APPROVAL_LABELS: Record<ToolApprovalState, string> = {
  pending: t('ui.catalogTypes.definitionApprovalPending'),
  reapproval: t('ui.catalogTypes.definitionReapprovalRequired'),
  approved: t('ui.catalogTypes.definitionApproved'),
  perCall: t('ui.catalogTypes.approveEachCall'),
  automatic: t('ui.catalogTypes.automaticallyAllowed'),
  notRequired: t('ui.catalogTypes.noSeparateDefinitionApprovalNeeded'),
  unknown: t('ui.catalogTypes.checkApprovalStatus'),
}
export type CatalogTool = {
  name: string
  title: string
  description: string
  sourceKind: ToolSourceKind
  providerId: string
  pluginId?: string
  pluginState?: 'enabled' | 'disabled' | 'missing'
  providerKind: 'builtin' | 'core' | 'community' | 'service'
  transport: 'inProcess' | 'stdio' | 'http'
  effects: ToolEffect[]
  enabled: boolean
  ready: boolean
  agentCallable: boolean
  status: string
  approval: ToolApprovalState
  action?: string
  definition?: RequestTool
}

export const TOOL_SOURCE_LABELS: Record<ToolSourceKind, string> = {
  builtin: t('ui.catalogTypes.verbexBuiltIn'),
  plugin: t('ui.catalogTypes.obsidianPluginAPI'),
  mcp: 'MCP',
}

export function catalogCounts(tools: readonly CatalogTool[]) {
  return {
    registered: tools.length,
    ready: tools.filter((tool) => tool.ready).length,
    candidates: tools.filter(
      (tool) => tool.enabled && tool.ready && tool.agentCallable,
    ).length,
  }
}
