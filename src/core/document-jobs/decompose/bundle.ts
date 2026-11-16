import { canonicalDigest } from '../../../security/promptInjectionBoundary'

import { HIERARCHY_RULES_VERSION, MD_DIALECT_V2 } from './dialectV2'
import { RULES } from './types'
export async function decompositionId(
  sourceSha256: string,
  derivationSha256: string,
  baseFontPt: number = RULES.baseFontPt,
): Promise<string> {
  return canonicalDigest({
    sourceSha256,
    rules: HIERARCHY_RULES_VERSION,
    dialect: MD_DIALECT_V2,
    derivationSha256,
    baseFontPt,
  })
}
