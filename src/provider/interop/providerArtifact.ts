import type { App } from 'obsidian'

import { t } from '../../i18n'
import { sha256HexBytes } from '../../utils/hash'

import type { PluginInstance } from './discovery'
import { DESCRIBE_CONCURRENCY, discoverWithinBudget } from './discoveryBudget'
import type { NativeProviderStatus } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024

/** Keep timed-out reads occupying their slots until the adapter actually settles. */
export class ArtifactChecks {
  private readonly pending = new Set<string>()

  digest(app: App, pluginId: string): Promise<string> {
    if (this.pending.has(pluginId) || this.pending.size >= DESCRIBE_CONCURRENCY)
      return Promise.reject(new Error(t('nativeProviderR10.artifactBusy')))
    this.pending.add(pluginId)
    const work = providerArtifactDigest(app, pluginId)
    const clear = () => this.pending.delete(pluginId)
    void work.then(clear, clear)
    return work
  }
}

export async function checkProviderArtifacts(
  app: App,
  plugins: readonly PluginInstance[],
  approvals: readonly NativeProviderApproval[],
  checks: ArtifactChecks,
  budgetMs: number,
): Promise<Map<string, { digest?: string; error?: NativeProviderStatus }>> {
  const pinned = plugins.filter((plugin) =>
    approvals.some(
      (approval) =>
        approval.providerId === plugin.id && approval.approvedArtifactSha256,
    ),
  )
  const results = await discoverWithinBudget(pinned, budgetMs, (plugin) =>
    checks.digest(app, plugin.id),
  )
  return new Map(
    results.map(({ item: plugin, value, error }) => [
      plugin.id,
      error === undefined && value
        ? { digest: value }
        : {
            error: {
              providerId: plugin.id,
              pluginVersion: plugin.version,
              state: 'error' as const,
              message: t('nativeProviderR10.pinnedArtifactUnavailable'),
            },
          },
    ]),
  )
}

export function checkDiscoveredArtifacts(
  options: {
    app: App
    approvals: readonly NativeProviderApproval[]
    runtimeState: { artifactChecks: ArtifactChecks }
  },
  results: readonly { item: PluginInstance; value?: unknown }[],
  budgetMs: number,
) {
  return checkProviderArtifacts(
    options.app,
    results.flatMap(({ item, value }) => (value ? [item] : [])),
    options.approvals,
    options.runtimeState.artifactChecks,
    budgetMs,
  )
}

/** Hash the installed bundle, not the already loaded JavaScript module. */
export async function providerArtifactDigest(
  app: App,
  providerId: string,
): Promise<string> {
  const configDir = app.vault.configDir
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(providerId) ||
    typeof configDir !== 'string' ||
    !configDir ||
    configDir.startsWith('/') ||
    configDir.includes('\\') ||
    configDir.includes(':') ||
    configDir.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error(t('nativeProviderR10.artifactPathUnavailable'))
  const path = `${configDir}/plugins/${providerId}/main.js`
  const adapter = app.vault.adapter
  const before = await adapter.stat(path)
  if (
    !before ||
    before.type !== 'file' ||
    !Number.isFinite(before.mtime) ||
    !Number.isSafeInteger(before.size) ||
    before.size < 0 ||
    before.size > MAX_ARTIFACT_BYTES
  )
    throw new Error(t('nativeProviderR10.artifactUnavailable'))
  const read = await adapter.readBinary(path)
  if (read.byteLength > MAX_ARTIFACT_BYTES || read.byteLength !== before.size)
    throw new Error(t('nativeProviderR10.artifactReadChanged'))
  // Hashing copies the input before its first await, so the adapter cannot
  // change the observed bytes while the second stat is pending.
  const [digest, after] = await Promise.all([
    sha256HexBytes(read),
    adapter.stat(path),
  ])
  if (
    !after ||
    after.type !== 'file' ||
    after.size !== before.size ||
    after.mtime !== before.mtime
  )
    throw new Error(t('nativeProviderR10.artifactReadChanged'))
  return digest
}
