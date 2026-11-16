import type { App } from 'obsidian'

import { readBrowserCapability } from './browserProtocol'
import { UnsafeValueError, readDataMember } from './descriptorReader'
import {
  AGENTINTEROP_PROTOCOL,
  AGENT_CAPABILITY_PROVIDER,
  ProviderCallTool,
} from './protocol'
import { readProviderCapabilities } from './providerCapabilities'

export type PluginInstance = { id: string; version: string; instance: object }

export function pluginIsInstalled(app: App, id: string): boolean {
  return !!(
    app as unknown as { plugins?: { manifests?: Record<string, unknown> } }
  ).plugins?.manifests?.[id]
}

export function pluginState(
  app: App,
  id: string,
): 'enabled' | 'disabled' | 'missing' {
  return !pluginIsInstalled(app, id)
    ? 'missing'
    : pluginIsEnabled(app, id)
      ? 'enabled'
      : 'disabled'
}

/** Enabled IDs include plugins whose runtime instance failed to load or describe. */
export function pluginIsEnabled(app: App, id: string): boolean {
  return (
    (
      app as unknown as { plugins?: { enabledPlugins?: Set<string> } }
    ).plugins?.enabledPlugins?.has(id) === true
  )
}

/**
 * The only place that touches the private plugin registry. Replace this one
 * function when Obsidian publishes an official enumeration API.
 */
export function listEnabledPluginInstances(app: App): PluginInstance[] {
  const registry = (
    app as unknown as {
      plugins?: {
        enabledPlugins?: Set<string>
        plugins?: Record<string, unknown>
      }
    }
  ).plugins
  if (!registry?.enabledPlugins || !registry.plugins) return []
  const found: PluginInstance[] = []
  for (const id of registry.enabledPlugins) {
    const instance: unknown = Object.getOwnPropertyDescriptor(
      registry.plugins,
      id,
    )?.value
    if (!instance || typeof instance !== 'object') continue
    try {
      const manifest = readDataMember(instance, 'manifest')
      if (!manifest || typeof manifest !== 'object') continue
      // The registry key must be the plugin's own id: no borrowed identity.
      if (readDataMember(manifest, 'id') !== id) continue
      const version = readDataMember(manifest, 'version')
      if (typeof version === 'string') found.push({ id, version, instance })
    } catch {
      // A plugin with accessor-shaped manifest fields simply is not a candidate.
    }
  }
  return found
}

export type ProviderHandle = {
  protocolVersion: 1 | 2
  browser?: import('./browserProtocol').BrowserCapability
  pluginId: string
  pluginVersion: string
  plugin: object
  provider: object
  describe: () => unknown
  callTool: ProviderCallTool
  hasResolveTarget: boolean
  hasCommit: boolean
  /** Fixes the real target of a session or commit call without changing anything. */
  resolveTarget?: (...args: unknown[]) => unknown
  /** Present when the provider can report the editor context of a submitted turn. */
  editor?: {
    receiver: object
    capture: (ctx: unknown) => unknown
    openDocuments?: (ctx: unknown) => unknown
    reveal?: (ctx: unknown, target: unknown) => unknown
    release?: (caller: unknown, documents?: unknown) => unknown
    discardAgentChanges?: (target: unknown, ctx: unknown) => unknown
  }
  /** Present when the provider can prepare and perform a write of user files. */
  commit?: {
    receiver: object
    prepare: (...args: unknown[]) => unknown
    execute: (...args: unknown[]) => unknown
    status: (...args: unknown[]) => unknown
  }
}

/**
 * Captures the provider object and the exact functions the host will call.
 * Returns undefined when the plugin exposes nothing; throws when it exposes
 * something that does not follow the protocol.
 */
export function readProviderHandle(
  plugin: PluginInstance,
): ProviderHandle | undefined {
  const provider = readDataMember(plugin.instance, AGENT_CAPABILITY_PROVIDER)
  if (provider === undefined || provider === null) return undefined
  if (typeof provider !== 'object')
    throw new UnsafeValueError('provider must be an object')
  if (readDataMember(provider, 'protocol') !== AGENTINTEROP_PROTOCOL)
    throw new Error('unknown provider protocol')
  const protocolVersion = readDataMember(provider, 'protocolVersion')
  if (protocolVersion !== 1 && protocolVersion !== 2)
    throw new Error('unsupported provider protocol version')
  const describe = readDataMember(provider, 'describe')
  const callTool = readDataMember(provider, 'callTool')
  if (typeof describe !== 'function' || typeof callTool !== 'function')
    throw new Error('provider must implement describe and callTool')
  return {
    protocolVersion,
    browser:
      protocolVersion === 2 ? readBrowserCapability(provider) : undefined,
    pluginId: plugin.id,
    pluginVersion: plugin.version,
    plugin: plugin.instance,
    provider,
    describe: describe as () => unknown,
    callTool: callTool as ProviderCallTool,
    ...readProviderCapabilities(provider),
  }
}
