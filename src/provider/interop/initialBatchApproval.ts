import { t } from '../../i18n'

import type { Discovered, NativeProviderStatus } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'
import { createProviderApproval } from './providerApproval'

export type ReviewedInitialProvider = {
  providerId: string
  digest: string
  pluginVersion: string
  protocolVersion: number
  artifactSha256?: string
}

export function approveReviewedInitialProvider(
  review: ReviewedInitialProvider,
  found: Discovered | undefined,
  approvals: readonly NativeProviderApproval[],
  statuses: readonly NativeProviderStatus[],
): NativeProviderApproval {
  if (approvals.some((item) => item.providerId === review.providerId))
    throw new Error(t('nativeProviderR10.initialApprovalExists'))
  const status = statuses.find((item) => item.providerId === review.providerId)
  if (
    status?.state !== 'pending' ||
    !found ||
    found.digest !== review.digest ||
    found.handle.pluginVersion !== review.pluginVersion ||
    found.handle.protocolVersion !== review.protocolVersion ||
    status.artifactSha256 !== review.artifactSha256
  )
    throw new Error(t('nativeProviderR10.pluginChanged'))
  return createProviderApproval(review.providerId, found)
}
