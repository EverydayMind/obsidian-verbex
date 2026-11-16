import type { PluginInstance, ProviderHandle } from './discovery'
import type { NativeProviderStatus } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'
import { providerIsActive } from './providerApproval'
import { providerInstanceCurrent } from './providerInstanceCurrent'

type Found = { handle: ProviderHandle; digest: string }
export type ProviderCurrentCause =
  | 'pending'
  | 'reapproval'
  | 'disabled'
  | 'artifact_unverified'
  | 'status_error'
  | 'instance_changed'

/** Undefined is current. All boolean callers use exactly this boundary. */
export function currentProviderCause(
  found: Found,
  latest: Found | undefined,
  approvals: readonly NativeProviderApproval[],
  disposed: boolean,
  list: () => PluginInstance[],
  name?: string,
  statuses?: readonly NativeProviderStatus[],
  fault = false,
): ProviderCurrentCause | undefined {
  const { handle, digest } = found
  const matches = approvals.filter(
    (item) => item.providerId === handle.pluginId,
  )
  const approval = matches[0]
  const status = statuses?.find((item) => item.providerId === handle.pluginId)
  if (status?.state === 'error')
    return status.descriptor ? 'status_error' : 'artifact_unverified'
  if (fault || matches.length > 1) return 'status_error'
  if (
    disposed ||
    latest?.digest !== digest ||
    latest.handle.provider !== handle.provider
  )
    return 'instance_changed'
  if (!approval) return 'pending'
  if (
    status?.state === 'reapproval' ||
    approval.approvedDescriptorDigest !== digest ||
    approval.approvedPluginVersion !== handle.pluginVersion ||
    approval.approvedProtocolVersion !== handle.protocolVersion
  )
    return 'reapproval'
  if (!approval.enabled || (name && approval.disabledToolNames.includes(name)))
    return 'disabled'
  if (statuses && !providerIsActive(statuses, handle.pluginId, approvals))
    return status?.state === 'pending' ? 'pending' : 'reapproval'
  return providerInstanceCurrent(handle, list) ? undefined : 'instance_changed'
}

export function isCurrentProvider(
  ...args: Parameters<typeof currentProviderCause>
): boolean {
  return currentProviderCause(...args) === undefined
}
