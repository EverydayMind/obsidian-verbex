import type { App } from 'obsidian'
import { useEffect, useState } from 'react'

import type { McpManager } from '../core/mcp/mcpManager'
import { t } from '../i18n'
import type VerbexPlugin from '../main'
import type { VerbexSettings } from '../settings/schema/setting.types'
import type { McpServerState } from '../types/mcp.types'

import { catalogPluginState } from './catalogPluginState'
import type { CatalogTool } from './catalogTypes'
import { nativeCatalog } from './nativeCatalog'
import {
  connectorCatalog,
  mcpCatalog,
  nativeProviderCatalog,
} from './providerCatalog'

// Provider, MCP and settings changes already refresh through events. The poll
// only catches plugins toggled without one, so an always-mounted consumer (the
// chat tool badge) must not rescan every provider every few seconds.
export const LIVE_CATALOG_POLL_MS = 3000
export const IDLE_CATALOG_POLL_MS = 60000

export function useToolCatalog(
  app: App,
  plugin: VerbexPlugin,
  settings: VerbexSettings,
  { live = true }: { live?: boolean } = {},
) {
  const [tools, setTools] = useState<CatalogTool[]>([])
  const [servers, setServers] = useState<McpServerState[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let currentServers: McpServerState[] = []
    let currentManager: McpManager | undefined
    let refreshing = false
    const refresh = async () => {
      if (refreshing || !active) return
      refreshing = true
      try {
        await plugin.pluginConnectorHost?.refresh()
        await plugin.nativeProviderHost?.refresh()
        const automatic = new Set<string>()
        const mcpTools = mcpCatalog(currentServers)
        await Promise.all(
          mcpTools.map(async (tool) => {
            const identity = await currentManager?.getToolIdentity(tool.name)
            if (
              identity &&
              currentManager?.automaticApprovalMatches(tool.name, identity)
            )
              automatic.add(tool.name)
          }),
        )
        // Catalog probes must not initialize PGlite or await plugin.whenReady.
        if (active) {
          setTools(
            [
              ...nativeCatalog(app, settings.chatOptions.enableTools),
              ...nativeProviderCatalog(
                plugin.nativeProviderHost?.getStatuses() ?? [],
                plugin.nativeProviderHost?.getEntries() ?? [],
              ),
              ...connectorCatalog(
                settings.pluginConnectors.connectors,
                plugin.pluginConnectorHost?.getEntries() ?? [],
                plugin.pluginConnectorHost?.getStatuses() ?? [],
              ),
              ...mcpCatalog(
                currentServers,
                (server) => currentManager?.isServerReady(server) ?? false,
                settings.verbex.permissions.allowExternalApi,
                (name) => (automatic.has(name) ? 'automatic' : 'perCall'),
              ),
            ].map((tool) => ({
              ...tool,
              ...(tool.sourceKind === 'plugin'
                ? { pluginState: catalogPluginState(app, tool) }
                : {}),
              enabled: tool.enabled && settings.chatOptions.enableTools,
            })),
          )
          setError('')
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : t('ui.useToolCatalog.couldNotCheckToolStatus'),
          )
      } finally {
        refreshing = false
      }
    }
    void refresh()
    void plugin
      .getMcpManager('tool-catalog')
      .then((manager) => {
        if (!active) return
        currentManager = manager
        currentServers = manager.getServers()
        setServers(currentServers)
        unsubscribe = manager.subscribeServersChange((next) => {
          currentServers = next
          if (active) setServers(next)
          void refresh()
        })
        void refresh()
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : t('ui.useToolCatalog.couldNotCheckMCPStatus'),
          )
      })
    const timer = window.setInterval(
      () => {
        void refresh()
      },
      live ? LIVE_CATALOG_POLL_MS : IDLE_CATALOG_POLL_MS,
    )
    const detachNative = plugin.nativeProviderHost?.onReady(
      () => void refresh(),
    )
    return () => {
      active = false
      unsubscribe?.()
      detachNative?.()
      window.clearInterval(timer)
    }
  }, [app, plugin, settings, live])
  return { tools, servers, error }
}
