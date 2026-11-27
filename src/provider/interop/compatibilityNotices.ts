import type { App } from 'obsidian'

import {
  compatibilityFindings,
  compatibilityPluginName,
} from './compatibilityRuntime'
import { listEnabledPluginInstances } from './discovery'
import { activeKnownBridges, bridgeNotices } from './knownBridges'

/**
 * What the chat notice and the settings badge say. Pure data: an empty table
 * and providers that all describe their assets with a known version give no
 * notice at all.
 */
export type CompatibilityNotice = {
  /** Stable key; a recommended notice closed by the user is remembered by it. */
  key: string
  kind: 'plugin' | 'host' | 'bridge'
  severity: 'required' | 'recommended'
  pluginId: string
  name: string
  /** Table feature for a plugin notice; undefined for a host or bridge notice. */
  feature?: string
  installed?: string
  required?: string
  messageKey?: string
  /** Stored connector a bridge-connector notice is about. */
  connectorId?: string
}

/** A provider whose describeAssets() version this Verbex does not know. */
export type HostOutdatedProvider = { pluginId: string; version: number }

type HostLike = {
  getStatuses(): readonly { providerId: string }[]
  hostContext(): {
    getActiveDiscovered(id: string): unknown
  }
}

/** Providers that describeAssets() with a version this host does not know. */
export function hostOutdatedProviders(host: HostLike): HostOutdatedProvider[] {
  const context = host.hostContext()
  return host.getStatuses().flatMap(({ providerId }) => {
    const found = context.getActiveDiscovered(providerId) as
      | { hostMembers?: { assetsUnsupportedVersion?: number } }
      | undefined
    const version = found?.hostMembers?.assetsUnsupportedVersion
    return version === undefined ? [] : [{ pluginId: providerId, version }]
  })
}

export function collectCompatibilityNotices(
  app: App,
  hostOutdated: readonly HostOutdatedProvider[],
  connectors: readonly { id: string; target: { pluginId: string } }[] = [],
): CompatibilityNotice[] {
  const notices: CompatibilityNotice[] = compatibilityFindings(app).map(
    (finding) => ({
      key: `${finding.pluginId}|${finding.feature}|${finding.required}`,
      kind: 'plugin' as const,
      severity: finding.severity,
      pluginId: finding.pluginId,
      name: compatibilityPluginName(app, finding.pluginId),
      feature: finding.feature,
      installed: finding.installed,
      required: finding.required,
      messageKey: finding.messageKey,
    }),
  )
  for (const item of hostOutdated)
    notices.push({
      key: `host|${item.pluginId}|${item.version}`,
      kind: 'host',
      severity: 'recommended',
      pluginId: item.pluginId,
      name: compatibilityPluginName(app, item.pluginId),
    })
  const enabledIds = listEnabledPluginInstances(app).map((item) => item.id)
  notices.push(...bridgeNotices(activeKnownBridges(), enabledIds, connectors))
  return notices
}

/** Required notices always stay; a recommended one stays until it is closed. */
export function visibleNotices(
  notices: readonly CompatibilityNotice[],
  closed: readonly string[],
): CompatibilityNotice[] {
  return notices.filter(
    (notice) => notice.severity === 'required' || !closed.includes(notice.key),
  )
}

/** Keeps only keys that still apply, so the saved list cannot grow without bound. */
export function closedAfterClosing(
  notices: readonly CompatibilityNotice[],
  closed: readonly string[],
  closing: readonly string[],
): string[] {
  const live = new Set(notices.map((notice) => notice.key))
  return [...new Set([...closed, ...closing])]
    .filter((key) => live.has(key))
    .slice(-100)
}
