import { hasNonRoundTripNumber, sortReadValue } from './canonicalRead'
import type { PriorToolResult } from './priorReads'

/** Reverse-order observations from one batch do not have a causal ordering. */
export class StructuredVersionOrder {
  private readonly latest = new Map<
    string,
    { version: string; batch?: string; ambiguous: boolean }
  >()

  isOlder(item: { key: string; version: string }, batch?: string): boolean {
    const known = this.latest.get(item.key)
    if (!known) {
      this.latest.set(item.key, {
        version: item.version,
        batch,
        ambiguous: batch === undefined,
      })
      return false
    }
    if (batch === undefined) {
      known.ambiguous = true
      return false
    }
    if (known.batch === batch) {
      if (known.version !== item.version) known.ambiguous = true
      return false
    }
    return !known.ambiguous && known.version !== item.version
  }
}

/** Only host-owned structured page formats with an explicit version are compared. */
export function structuredReadVersion(
  result: PriorToolResult,
): { key: string; version: string } | undefined {
  const name = result.call.name
  if (
    (name !== 'read_style_profile' && name !== 'check_report_draft') ||
    !result.text ||
    result.text.length > 128 * 1024 ||
    (result.call.arguments?.length ?? 0) > 128 * 1024
  )
    return undefined
  try {
    const args: unknown = JSON.parse(result.call.arguments ?? '{}')
    const output: unknown = JSON.parse(result.text)
    if (
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args) ||
      !output ||
      typeof output !== 'object' ||
      Array.isArray(output) ||
      hasNonRoundTripNumber(args) ||
      hasNonRoundTripNumber(result.disclosure)
    )
      return undefined
    const input = args as Record<string, unknown>,
      page = output as Record<string, unknown>
    if (
      typeof input.profile_path !== 'string' ||
      !input.profile_path ||
      !Array.isArray(page.items) ||
      !Object.prototype.hasOwnProperty.call(page, 'nextOffset') ||
      (page.nextOffset !== null &&
        (!Number.isSafeInteger(page.nextOffset) ||
          (page.nextOffset as number) < 0)) ||
      (input.view !== undefined && typeof input.view !== 'string')
    )
      return undefined
    if (page.state !== undefined && page.state !== 'available') return undefined
    if (
      name === 'check_report_draft' &&
      (typeof input.draft_path !== 'string' ||
        !input.draft_path ||
        page.state !== 'available')
    )
      return undefined
    const version =
      name === 'check_report_draft' ? page.inputsDigest : page.noteSha256
    if (typeof version !== 'string' || !/^[0-9a-f]{64}$/.test(version))
      return undefined
    const expected =
      name === 'check_report_draft'
        ? input.expected_inputs_digest
        : input.expected_note_sha256
    if (expected !== undefined && expected !== version) return undefined
    const omitted = new Set([
      'offset',
      'limit',
      name === 'check_report_draft'
        ? 'expected_inputs_digest'
        : 'expected_note_sha256',
    ])
    const subject = Object.fromEntries(
      Object.entries(input).filter(([key]) => !omitted.has(key)),
    )
    if (name === 'read_style_profile' && subject.view === undefined)
      subject.view = 'summary'
    return {
      key: JSON.stringify([
        name,
        sortReadValue(subject),
        sortReadValue(result.disclosure ?? null),
      ]),
      version,
    }
  } catch {
    return undefined
  }
}
