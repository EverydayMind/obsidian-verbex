import { L } from '../../i18n/modelText'

import { recoveryActions } from './documentJobRecoveryActions'
import type { JsonObject } from './protocol'

export function documentJobRecovery(
  reason: string,
  details?: JsonObject,
  providerName = 'md-to-hwpx',
): JsonObject {
  if (reason === 'decomposition_dialect_retired')
    return {
      plugin: 'md-to-hwpx',
      cause: reason,
      sourceAvailable: details?.sourceAvailable === true,
      ...(typeof details?.sourcePath === 'string'
        ? { sourcePath: details.sourcePath }
        : {}),
      userAction:
        details?.sourceAvailable === true
          ? L({
              ko: '원본에서 다시 분해하세요.',
              en: 'Decompose again from the source.',
            })
          : L({
              ko: '원본을 복구한 뒤 다시 분해하세요.',
              en: 'Restore the source, then decompose it again.',
            }),
    }
  const cause = typeof details?.cause === 'string' ? details.cause : reason
  return {
    plugin: 'md-to-hwpx',
    cause,
    userAction:
      recoveryActions(`'${providerName}'`)[cause] ??
      L({
        ko: `${providerName}의 샘플과 서식 작업 차단 이유를 확인한 뒤 다시 요청하세요.`,
        en: `Check the sample and the reason the format job is blocked for ${providerName}, then request again.`,
      }),
  }
}

export const documentJobApprovalCauses = new Set([
  'pending',
  'reapproval',
  'disabled',
  'artifact_unverified',
  'provider_not_current',
  'grant_missing',
  'grant_digest_stale',
  'commit_disabled',
  'tool_disabled',
  'policy_changed',
  'descriptor_changed',
])
