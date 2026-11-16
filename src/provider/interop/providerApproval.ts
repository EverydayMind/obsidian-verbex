import { t } from '../../i18n'

import type { ProviderCurrentCause } from './currentProvider'
import type { PluginInstance } from './discovery'
import type {
  Discovered,
  NativeProviderStatus,
  NativeToolEntry,
} from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'
import { providerExposureHealth } from './providerExposureHealth'
import type { ProviderRuntimeState } from './providerRuntimeState'

export function providerEntries(
  entries: ReadonlyMap<string, NativeToolEntry>,
  discovered: ReadonlyMap<string, Discovered>,
  runtimeState: ProviderRuntimeState,
  statuses: readonly NativeProviderStatus[],
  approvals: readonly NativeProviderApproval[],
): NativeToolEntry[] {
  return [...entries.values()].filter((entry) => {
    const found = discovered.get(entry.providerId)
    const approval = approvals.find(
      (item) => item.providerId === entry.providerId,
    )
    return (
      found &&
      !runtimeState.fault(found.handle) &&
      providerIsActive(statuses, entry.providerId, approvals) &&
      !approval?.disabledToolNames.includes(entry.tool.name)
    )
  })
}

export function duplicateApprovalStatus(
  id: string,
  version: string,
  found: Discovered,
): NativeProviderStatus {
  return {
    providerId: id,
    pluginVersion: version,
    protocolVersion: found.handle.protocolVersion,
    state: 'error',
    message: t('nativeProviderR10.duplicateRecords'),
    digest: found.digest,
    descriptor: found.descriptor,
    descriptorJson: found.descriptorJson,
  }
}

export function providerStatuses(
  statuses: readonly NativeProviderStatus[],
  discovered: ReadonlyMap<string, Discovered>,
  runtimeState: ProviderRuntimeState,
  plugins: readonly PluginInstance[] = [],
  cause: (found: Discovered) => ProviderCurrentCause | undefined = () =>
    undefined,
): NativeProviderStatus[] {
  const health = providerExposureHealth(
    discovered,
    runtimeState,
    plugins,
    cause,
  )
  return statuses.map((status) => {
    const found = discovered.get(status.providerId)
    const fault = found && runtimeState.fault(found.handle)
    return {
      ...(fault
        ? { ...status, state: 'error' as const, message: fault }
        : status),
      ...health(status.providerId),
    }
  })
}

export const providerIsActive = (
  statuses: readonly NativeProviderStatus[],
  id: string,
  approvals: readonly NativeProviderApproval[],
) => {
  const matches = approvals.filter((approval) => approval.providerId === id)
  if (matches.length !== 1 || !matches[0].enabled) return false
  const approval = matches[0]
  return statuses.some(
    (status) =>
      status.providerId === id &&
      status.state === 'active' &&
      approval.approvedDescriptorDigest === status.digest &&
      approval.approvedPluginVersion === status.pluginVersion &&
      approval.approvedProtocolVersion === status.protocolVersion &&
      (!approval.approvedArtifactSha256 ||
        approval.approvedArtifactSha256 === status.artifactSha256),
  )
}

export function providerInstructions(
  names: readonly string[],
  entries: readonly NativeToolEntry[],
  discovered: ReadonlyMap<string, Discovered>,
): { providerId: string; text: string }[] {
  const requested = new Set(names)
  const ids = new Set(
    entries
      .filter((entry) => requested.has(entry.name))
      .map((entry) => entry.providerId),
  )
  return [...ids].flatMap((providerId) => {
    const text = discovered.get(providerId)?.descriptor.instructions
    return text ? [{ providerId, text }] : []
  })
}

export function createProviderApproval(
  providerId: string,
  found: Discovered,
): NativeProviderApproval {
  return {
    providerId,
    enabled: true,
    approvedDescriptorDigest: found.digest,
    approvedPluginVersion: found.handle.pluginVersion,
    approvedProtocolVersion: found.handle.protocolVersion,
    disabledToolNames: [],
    ...(found.descriptorJson
      ? { approvedDescriptorJson: found.descriptorJson }
      : {}),
  }
}

export function approveReviewedProvider(
  providerId: string,
  reviewedDigest: string,
  reviewedArtifactSha256: string | undefined,
  found: Discovered | undefined,
  approvals: readonly NativeProviderApproval[],
  statuses: readonly NativeProviderStatus[],
): NativeProviderApproval {
  if (!found) throw new Error(t('nativeProviderR10.providerMissing'))
  if (found.digest !== reviewedDigest)
    throw new Error(t('nativeProviderR10.definitionsChanged'))
  const matching = approvals.filter((item) => item.providerId === providerId)
  if (matching.length > 1)
    throw new Error(t('nativeProviderR10.duplicateApproval'))
  const previous = matching[0]
  if (
    previous?.approvedArtifactSha256 &&
    (!reviewedArtifactSha256 ||
      statuses.find((status) => status.providerId === providerId)
        ?.artifactSha256 !== reviewedArtifactSha256)
  )
    throw new Error(t('nativeProviderR10.artifactChanged'))
  return {
    ...createProviderApproval(providerId, found),
    ...(previous
      ? {
          enabled: previous.enabled,
          disabledToolNames: [...previous.disabledToolNames],
        }
      : {}),
    ...(previous?.approvedArtifactSha256
      ? { approvedArtifactSha256: reviewedArtifactSha256 }
      : {}),
  }
}
