import type { App } from 'obsidian'

import { t } from '../../i18n'

import { approvalState } from './approvalState'
import {
  type CommitPolicy,
  commitPolicyIdentity,
  nativeEffectAvailable,
} from './commitPolicy'
import { descriptorDiff } from './descriptorDiff'
import { PluginInstance, listEnabledPluginInstances } from './discovery'
import { discoverWithinBudget } from './discoveryBudget'
import { statusSnapshotFields } from './hostCapabilities/providerAssets'
import type {
  Discovered,
  NativeProviderState,
  NativeProviderStatus,
  NativeToolEntry,
  ScanResult,
} from './hostScanTypes'
import {
  NativeProviderApproval,
  nativeToolDefinition,
  nativeToolName,
} from './protocol'
import { duplicateApprovalStatus } from './providerApproval'
import { checkDiscoveredArtifacts } from './providerArtifact'
import type { ProviderRuntimeState } from './providerRuntimeState'

export type {
  NativeProviderState,
  NativeProviderStatus,
  NativeToolEntry,
  Discovered,
} from './hostScanTypes'

export async function scanEnabledProviders(options: {
  app: App
  selfId?: string
  list?: (app: App) => PluginInstance[]
  refreshBudgetMs?: number
  browserEffects?: boolean
  commitPolicy?: CommitPolicy
  commitEffects?: boolean
  sessionEffects?: boolean
  approvals: readonly NativeProviderApproval[]
  busy: Set<string>
  runtimeState: ProviderRuntimeState
  discover: (plugin: PluginInstance) => Promise<Discovered | undefined>
}): Promise<ScanResult> {
  const plugins = (options.list ?? listEnabledPluginInstances)(
    options.app,
  ).filter((plugin) => plugin.id !== options.selfId)
  const deadline = options.refreshBudgetMs ?? 2000
  const results = await discoverWithinBudget(plugins, deadline, (plugin) =>
    options.discover(plugin),
  )
  const artifacts = await checkDiscoveredArtifacts(options, results, deadline)
  const discovered = new Map<string, Discovered>()
  const entries = new Map<string, NativeToolEntry>()
  const statuses: NativeProviderStatus[] = []
  for (const { item: plugin, value: found, error } of results) {
    if (error !== undefined) {
      statuses.push({
        providerId: plugin.id,
        pluginVersion: plugin.version,
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('nativeProviderR10.discoveryError'),
      })
      continue
    }
    if (!found) continue
    discovered.set(plugin.id, found)
    const approvals = options.approvals.filter(
      (item) => item.providerId === plugin.id,
    )
    if (approvals.length > 1) {
      statuses.push(duplicateApprovalStatus(plugin.id, plugin.version, found))
      continue
    }
    const approval = approvals[0]
    const artifact = artifacts.get(plugin.id)
    if (artifact?.error) {
      statuses.push(artifact.error)
      continue
    }
    const state: NativeProviderState = approvalState(approval, {
      digest: found.digest,
      pluginVersion: plugin.version,
      protocolVersion: found.handle.protocolVersion,
      artifactDigest: artifact?.digest,
    })
    const diff =
      state === 'reapproval' && approval
        ? await descriptorDiff(
            approval.approvedDescriptorJson,
            approval.approvedDescriptorDigest,
            found.descriptorJson,
            found.digest,
          )
        : undefined
    statuses.push({
      providerId: plugin.id,
      pluginVersion: plugin.version,
      protocolVersion: found.handle.protocolVersion,
      state,
      message: t(
        `nativeProviderR10.${state === 'active' && options.busy.has(plugin.id) ? 'busy' : state}`,
      ),
      digest: found.digest,
      descriptor: found.descriptor,
      descriptorJson: found.descriptorJson,
      ...statusSnapshotFields(found),
      ...(artifact?.digest ? { artifactSha256: artifact.digest } : {}),
      ...(diff ? { descriptorDiff: diff } : {}),
    })
    if (state !== 'active' || !approval) continue
    for (const tool of found.descriptor.tools) {
      if (!nativeEffectAvailable(tool, options, found)) continue
      if (approval.disabledToolNames.includes(tool.name)) continue
      const name = nativeToolName(plugin.id, tool.name)
      entries.set(name, {
        name,
        providerId: plugin.id,
        tool,
        policyRevision: options.commitPolicy?.revision,
        identity: [
          ...commitPolicyIdentity(tool, options.commitPolicy),
          found.digest + (approval.approvedArtifactSha256 ?? ''),
          plugin.version,
          options.runtimeState.id(found.handle.plugin),
          found.generation,
          options.runtimeState.id(found.handle.callTool),
          ...Object.values(found.handle.browser ?? {}).map((member) =>
            options.runtimeState.id(member),
          ),
        ].join(':'),
        definition: nativeToolDefinition(name, tool),
      })
    }
  }
  return { discovered, entries, statuses }
}
