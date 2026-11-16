import { sha256Hex } from '../../../../utils/hash'
import type { RoundTrip } from '../fitness'

/** Require an exact transformed digest and keep the original correspondence order. */
export async function matchTransformedText(
  raw: RoundTrip,
  text: string,
  ref: string,
  used: Map<string, string>,
) {
  const digest = await sha256Hex(text.replace(/\s+/gu, ' ').trim())
  const candidates =
    raw.unmatchedText?.filter(
      (o) => ![...used.values()].includes(o.ref) && o.textSha256 === digest,
    ) ?? []
  if (candidates.length !== 1) return null
  const output = candidates[0].ref
  const ordinal = (r: string) => Number(/^s0\/p(\d+)$/.exec(r)?.[1] ?? NaN)
  if (
    [
      ...(raw.R4?.pairs ?? []),
      ...[...used].map(([sourceRef, outputRef]) => ({ sourceRef, outputRef })),
    ].some(
      (p) =>
        (ordinal(p.sourceRef) < ordinal(ref) &&
          ordinal(p.outputRef) >= ordinal(output)) ||
        (ordinal(p.sourceRef) > ordinal(ref) &&
          ordinal(p.outputRef) <= ordinal(output)),
    )
  )
    return null
  used.set(ref, output)
  return output
}
