import { sha256Hex } from '../../../utils/hash'
import { tokenCountPlainText } from '../../../utils/llm/token'

import { hasInvalidText, startsWithBom } from './textRules'

export const MAX_SKILL_BODY_CHARS = 60_000

export type SkillBodyReason =
  | 'invalid_body'
  | 'hash_mismatch'
  | 'token_mismatch'
  | 'token_unavailable'

export type SkillBodyResult =
  | { ok: true }
  | { ok: false; reason: SkillBodyReason }

export type DeclaredSkillBody = { bodySha256: string; bodyTokens: number }

/**
 * Checks a readAsset body against the declared digest: format first, then the
 * UTF-8 SHA-256, then the plain-text cl100k_base token count.
 */
export async function verifySkillBody(
  body: unknown,
  declared: DeclaredSkillBody,
  countTokens: (text: string) => Promise<number> = tokenCountPlainText,
): Promise<SkillBodyResult> {
  if (
    typeof body !== 'string' ||
    body.length > MAX_SKILL_BODY_CHARS ||
    hasInvalidText(body) ||
    startsWithBom(body)
  )
    return { ok: false, reason: 'invalid_body' }
  if ((await sha256Hex(body)) !== declared.bodySha256)
    return { ok: false, reason: 'hash_mismatch' }
  let tokens: number
  try {
    tokens = await countTokens(body)
  } catch {
    return { ok: false, reason: 'token_unavailable' }
  }
  return tokens === declared.bodyTokens
    ? { ok: true }
    : { ok: false, reason: 'token_mismatch' }
}
