import { mcpNameSupported } from '../core/mcp/toolCatalog'
import { t } from '../i18n'
import type { ConnectorManifest } from '../provider/connectors/manifestSchema'
import { connectorToolName } from '../provider/connectors/manifestSchema'
import type {
  ConnectorEntry,
  ConnectorStatus,
} from '../provider/connectors/PluginConnectorHost'
import { KORDOC_PROVIDER_ID } from '../provider/contract'
import type {
  NativeProviderStatus,
  NativeToolEntry,
} from '../provider/interop/NativeProviderHost'
import { nativeToolName } from '../provider/interop/protocol'
import type { RequestTool } from '../types/llm/request'
import { McpServerState, McpServerStatus } from '../types/mcp.types'

import {
  type CatalogTool,
  KORDOC_BUILTIN_GROUP,
  type ToolApprovalState,
} from './catalogTypes'

export function connectorCatalog(
  manifests: readonly ConnectorManifest[],
  entries: readonly ConnectorEntry[],
  statuses: readonly ConnectorStatus[],
): CatalogTool[] {
  return manifests.flatMap((manifest) =>
    manifest.tools.map((tool) => {
      const name = connectorToolName(manifest, tool)
      const entry = entries.find(
        (candidate) => candidate.definition.function.name === name,
      )
      const status = statuses.find((candidate) => candidate.id === manifest.id)
      return {
        name,
        title: tool.name,
        description: tool.description,
        sourceKind: 'plugin',
        providerId: manifest.target.pluginId,
        pluginId: manifest.target.pluginId,
        providerKind: 'community',
        transport: 'inProcess',
        effects: ['read'],
        enabled: manifest.enabled && !tool.options.disabled,
        ready:
          status?.status === t('ui.providerCatalog.active') ||
          status?.status === t('ui.providerCatalog.callInProgress'),
        agentCallable: tool.options.agentCallable,
        approval:
          status?.status === t('ui.providerCatalog.active2') ||
          status?.status === t('ui.providerCatalog.callInProgress2')
            ? 'approved'
            : status?.status === t('ui.providerCatalog.needsVerification') ||
                (status?.status === t('ui.providerCatalog.approvalRequired') &&
                  !!manifest.approved)
              ? 'reapproval'
              : !manifest.approved
                ? 'pending'
                : 'unknown',
        status: status?.status ?? t('ui.providerCatalog.checkingStatus'),
        action: entry
          ? undefined
          : t(
              'ui.providerCatalog.checkInstallationActivationOrReviewReapproval',
            ),
        definition: entry?.definition,
      }
    }),
  )
}

export function nativeProviderCatalog(
  statuses: readonly NativeProviderStatus[],
  entries: readonly NativeToolEntry[],
): CatalogTool[] {
  return statuses.flatMap((status) =>
    (status.descriptor?.tools ?? []).map((tool) => {
      const name = nativeToolName(status.providerId, tool.name)
      const entry = entries.find((candidate) => candidate.name === name)
      const readable =
        tool.effect === 'read' || tool.effect === 'pure' || !!entry
      return {
        name,
        title: tool.title ?? tool.name,
        description: tool.description,
        sourceKind: 'plugin',
        providerId: status.providerId,
        pluginId: status.providerId,
        providerKind: 'community',
        transport: 'inProcess',
        effects: [
          tool.effect === 'browser'
            ? 'externalCall'
            : tool.effect === 'commit'
              ? 'vaultWrite'
              : tool.effect === 'session'
                ? 'sessionEdit'
                : 'read',
        ],
        enabled: status.state === 'active' && !!entry,
        ready: status.state === 'active',
        agentCallable: readable,
        approval:
          status.state === 'active' || status.state === 'disabled'
            ? 'approved'
            : status.state === 'error'
              ? 'unknown'
              : status.state,
        status: readable
          ? t('ui.providerCatalog.pluginExposed', { p0: status.message })
          : t('ui.providerCatalog.pluginExposedEditingAndSavingToolsNot'),
        action:
          entry || !readable
            ? undefined
            : t('ui.providerCatalog.reviewAndApproveToolDefinitions'),
        definition: entry?.definition,
      } satisfies CatalogTool
    }),
  )
}

export function registeredPluginCatalog(
  definitions: readonly RequestTool[],
): CatalogTool[] {
  return definitions.map((definition) => ({
    name: definition.function.name,
    title: definition.function.name,
    description: definition.function.description ?? '',
    sourceKind: 'plugin',
    providerId: KORDOC_BUILTIN_GROUP,
    pluginId: KORDOC_PROVIDER_ID,
    providerKind: 'community',
    transport: 'inProcess',
    effects:
      definition.function.name === 'kordoc__prepare_block_patch'
        ? ['vaultWrite']
        : ['read'],
    enabled: true,
    ready: true,
    agentCallable: true,
    approval: 'notRequired',
    status: t('ui.providerCatalog.available'),
    definition,
  }))
}

export function mcpCatalog(
  servers: readonly McpServerState[],
  isReady: (server: McpServerState) => boolean = () => true,
  allowed = true,
  approvalFor: (name: string) => ToolApprovalState = () => 'perCall',
): CatalogTool[] {
  return servers.flatMap((server) =>
    server.status !== McpServerStatus.Connected
      ? []
      : server.tools.map((tool) => ({
          name: `${server.name}__${tool.name}`,
          title: tool.title ?? tool.name,
          description: tool.description ?? '',
          sourceKind: 'mcp',
          providerId: server.name,
          providerKind: 'service',
          transport:
            server.config.parameters.transport === 'http' ? 'http' : 'stdio',
          effects: ['externalCall'],
          enabled:
            server.config.enabled &&
            !server.config.toolOptions[tool.name]?.disabled,
          ready: isReady(server),
          agentCallable:
            allowed && mcpNameSupported(`${server.name}__${tool.name}`),
          approval: approvalFor(`${server.name}__${tool.name}`),
          status: !allowed
            ? t('ui.providerCatalog.externalAPICallsAreDisabled')
            : !isReady(server)
              ? t('ui.providerCatalog.tokenChangedOrMissingReconnect')
              : mcpNameSupported(`${server.name}__${tool.name}`)
                ? t('ui.providerCatalog.connectedApprovalPerCallByDefault')
                : t('ui.providerCatalog.unsupportedModelToolNameFormat'),
          action: !allowed
            ? t('ui.providerCatalog.allowExternalAPIsInAgentPermissions')
            : !isReady(server)
              ? t('ui.providerCatalog.checkKeychainAndReconnectTheServer')
              : mcpNameSupported(`${server.name}__${tool.name}`)
                ? undefined
                : t(
                    'ui.providerCatalog.useLettersNumbersUnderscoresAndHyphensAt',
                  ),
        })),
  )
}
