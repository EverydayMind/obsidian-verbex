import type { ProviderCurrentCause } from './currentProvider'
import type { ExposureGateReason } from './exposureGates'
import type { NativeProviderStatus } from './hostScanTypes'
import { type NativeProviderApproval, nativeToolName } from './protocol'

export type ExposureProviderSummary = {
  providerId: string
  state: NativeProviderStatus['state']
  approval: 'ok' | 'pending' | 'reapproval' | 'disabled' | 'none'
  runtimeFault: boolean
  descriptor: boolean
  descriptorTools: number
  notReady: Record<string, number>
  currentProviderCause?: ProviderCurrentCause
}

/** Only enumerated state and counts leave the submission snapshot. */
export function exposureProviderSummaries(
  statuses: readonly NativeProviderStatus[],
  approvals: readonly NativeProviderApproval[],
  gates: readonly ExposureGateReason[],
): ExposureProviderSummary[] {
  return statuses.map((status) => {
    const matches = approvals.filter(
      (item) => item.providerId === status.providerId,
    )
    const approval = matches.length === 1 ? matches[0] : undefined
    const tools = status.descriptor?.tools ?? []
    const names = new Set(
      tools.map((tool) => nativeToolName(status.providerId, tool.name)),
    )
    const notReady: Record<string, number> = {}
    for (const gate of gates)
      if (gate.reason === 'not_ready' && names.has(gate.name) && gate.detail)
        notReady[gate.detail] = (notReady[gate.detail] ?? 0) + 1
    return {
      providerId: status.providerId,
      state: status.state,
      approval: !approval
        ? status.state === 'pending'
          ? 'pending'
          : 'none'
        : status.state === 'reapproval' ||
            (status.digest !== undefined &&
              approval.approvedDescriptorDigest !== status.digest) ||
            approval.approvedPluginVersion !== status.pluginVersion ||
            (status.protocolVersion !== undefined &&
              approval.approvedProtocolVersion !== status.protocolVersion) ||
            (status.artifactSha256 !== undefined &&
              approval.approvedArtifactSha256 !== undefined &&
              approval.approvedArtifactSha256 !== status.artifactSha256)
          ? 'reapproval'
          : !approval.enabled
            ? 'disabled'
            : 'ok',
      runtimeFault: status.runtimeFault === true,
      descriptor: !!status.descriptor,
      descriptorTools: tools.length,
      notReady,
      ...(status.currentProviderCause
        ? { currentProviderCause: status.currentProviderCause }
        : {}),
    }
  })
}

export const EXPOSURE_PROVIDER_LIMIT = 32
const states = new Set(['pending', 'active', 'reapproval', 'disabled', 'error'])
const approvals = new Set(['ok', 'pending', 'reapproval', 'disabled', 'none'])
const causes = new Set([
  'pending',
  'reapproval',
  'disabled',
  'artifact_unverified',
  'status_error',
  'instance_changed',
])

/** Re-project at the buffer boundary, dropping arbitrary extensions and unsafe IDs. */
export function boundedProviderSummaries(
  summaries: readonly ExposureProviderSummary[],
) {
  return {
    providers: summaries.slice(0, EXPOSURE_PROVIDER_LIMIT).map((item) => ({
      providerId: /^[A-Za-z0-9_.:-]{1,100}$/.test(item.providerId)
        ? item.providerId
        : 'redacted',
      state: states.has(item.state) ? item.state : 'error',
      approval: approvals.has(item.approval) ? item.approval : 'none',
      runtimeFault: item.runtimeFault,
      descriptor: item.descriptor,
      descriptorTools:
        item.descriptor && Number.isSafeInteger(item.descriptorTools)
          ? Math.max(0, Math.min(1_000_000_000, item.descriptorTools))
          : 0,
      notReady: Object.fromEntries(
        Object.entries(item.notReady)
          .filter(
            ([key, value]) =>
              states.has(key) && Number.isSafeInteger(value) && value > 0,
          )
          .map(([key, value]) => [key, Math.min(1_000_000_000, value)]),
      ),
      ...(item.currentProviderCause && causes.has(item.currentProviderCause)
        ? { currentProviderCause: item.currentProviderCause }
        : {}),
    })),
    providerOverflow: Math.max(0, summaries.length - EXPOSURE_PROVIDER_LIMIT),
  }
}
