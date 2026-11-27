import type { Discovered, NativeProviderState } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'

export function approvalState(
  approval: NativeProviderApproval | undefined,
  current: {
    digest: string
    pluginVersion: string
    protocolVersion: Discovered['handle']['protocolVersion']
    artifactDigest: string | undefined
  },
): NativeProviderState {
  return !approval
    ? 'pending'
    : approval.approvedDescriptorDigest !== current.digest ||
        approval.approvedPluginVersion !== current.pluginVersion ||
        (approval.approvedArtifactSha256 !== undefined &&
          approval.approvedArtifactSha256 !== current.artifactDigest) ||
        approval.approvedProtocolVersion !== current.protocolVersion
      ? 'reapproval'
      : approval.enabled
        ? 'active'
        : 'disabled'
}
