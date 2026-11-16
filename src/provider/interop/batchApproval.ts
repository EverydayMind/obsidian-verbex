import { t } from '../../i18n'

import type { Discovered, NativeProviderStatus } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'
import { createProviderApproval } from './providerApproval'

export type ReviewedProvider = {
  providerId: string
  digest: string
  pluginVersion: string
  protocolVersion: number
  previous: NativeProviderApproval
  artifactSha256?: string
}

export function copyApproval(
  approval: NativeProviderApproval,
): NativeProviderApproval {
  return { ...approval, disabledToolNames: [...approval.disabledToolNames] }
}

export function copyReviews(
  reviews: readonly ReviewedProvider[],
): ReviewedProvider[] {
  return reviews.map((review) => ({
    ...review,
    previous: copyApproval(review.previous),
  }))
}

export function retainCurrentReviews(
  reviews: readonly ReviewedProvider[],
  statuses: readonly NativeProviderStatus[],
): ReviewedProvider[] {
  return reviews.filter((review) =>
    statuses.some(
      (status) =>
        status.providerId === review.providerId &&
        status.state === 'reapproval' &&
        status.digest === review.digest &&
        status.pluginVersion === review.pluginVersion &&
        status.protocolVersion === review.protocolVersion &&
        status.artifactSha256 === review.artifactSha256,
    ),
  )
}

/** All entries are checked against the same completed scan before any is returned. */
export function approveReviewedBatch(
  reviews: readonly ReviewedProvider[],
  discovered: ReadonlyMap<string, Discovered>,
  approvals: readonly NativeProviderApproval[],
  statuses: readonly NativeProviderStatus[],
): NativeProviderApproval[] {
  if (
    !reviews.length ||
    new Set(reviews.map((item) => item.providerId)).size !== reviews.length
  )
    throw new Error(t('nativeProviderR10.selectAgain'))
  return reviews.map((review) => {
    const found = discovered.get(review.providerId)
    const previous = approvals.find(
      (item) => item.providerId === review.providerId,
    )
    if (
      approvals.filter((item) => item.providerId === review.providerId)
        .length !== 1
    )
      throw new Error(t('nativeProviderR10.approvalMissing'))
    if (
      statuses.find((item) => item.providerId === review.providerId)?.state !==
        'reapproval' ||
      !found ||
      !previous ||
      (!!previous.approvedArtifactSha256 && !review.artifactSha256) ||
      found.digest !== review.digest ||
      found.handle.pluginVersion !== review.pluginVersion ||
      found.handle.protocolVersion !== review.protocolVersion ||
      statuses.find((item) => item.providerId === review.providerId)
        ?.artifactSha256 !== review.artifactSha256 ||
      JSON.stringify(previous) !== JSON.stringify(review.previous)
    )
      throw new Error(t('nativeProviderR10.approvalChanged'))
    if (
      previous.approvedDescriptorDigest === found.digest &&
      previous.approvedPluginVersion === found.handle.pluginVersion &&
      previous.approvedProtocolVersion === found.handle.protocolVersion &&
      (!previous.approvedArtifactSha256 ||
        previous.approvedArtifactSha256 === review.artifactSha256)
    )
      throw new Error(t('nativeProviderR10.alreadyApproved'))
    return {
      ...createProviderApproval(review.providerId, found),
      enabled: previous.enabled,
      disabledToolNames: [...previous.disabledToolNames],
      ...(previous.approvedArtifactSha256
        ? { approvedArtifactSha256: review.artifactSha256 }
        : {}),
    }
  })
}
