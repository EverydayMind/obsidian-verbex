import type { JsonObject } from '../../../provider/interop/protocol'

import { HIERARCHY_RULES_VERSION, MD_DIALECT_V2 } from './dialectV2'

export function dialectProblem(
  markdownDialect: unknown,
  templateDialect: string | null,
  _authority: 'record' | 'bundle' = 'record',
): { reason: string; details: JsonObject } | null {
  if ([templateDialect, markdownDialect].includes('hwpx-exporter-md/1'))
    return {
      reason: 'decomposition_dialect_retired',
      details: { cause: 'dialect_retired' },
    }
  for (const dialect of [templateDialect, markdownDialect])
    if (typeof dialect === 'string' && dialect !== MD_DIALECT_V2)
      return {
        reason: 'dialect_unsupported',
        details: { dialect_unsupported: [{ dialect }] },
      }
  return null
}
export function verificationVersionProblem(
  dialect?: string,
  recordedVersion?: string,
) {
  return dialect === MD_DIALECT_V2 &&
    recordedVersion !== HIERARCHY_RULES_VERSION
    ? {
        verification_rules_version_unsupported: [
          {
            recordedVersion: recordedVersion ?? '',
            currentVersion: HIERARCHY_RULES_VERSION,
          },
        ],
      }
    : null
}
