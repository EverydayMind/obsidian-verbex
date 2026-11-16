import type { BindingCandidate } from '../report-style/bindingCandidates'

export type BaseSource = 'setting' | 'request'
export type EffectiveSource = 'requested' | 'fallback' | 'symbol_body'
export const validBaseFontPt = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 6 &&
  value <= 40 &&
  Number.isInteger(value * 2)
export const baseFontPt = (value: unknown): number =>
  validBaseFontPt(value) ? value : 15
const sameSize = (a: number, b: number) => Math.abs(a - b) <= 0.05 + 1e-9

/** Candidates arrive ordered by frequency, then document order. Unknown sizes stay BODY-only. */
export function resolveBaseFont(plain: BindingCandidate[], requested: number) {
  const effectiveSource: EffectiveSource = !plain.length
    ? 'symbol_body'
    : plain.some(
          (item) => item.sizePt != null && sameSize(item.sizePt, requested),
        )
      ? 'requested'
      : 'fallback'
  const effectiveBaseFontPt =
    effectiveSource === 'requested' ? requested : (plain[0]?.sizePt ?? null)
  const body = plain.filter(
    (item) =>
      item.sizePt == null ||
      (effectiveBaseFontPt != null &&
        sameSize(item.sizePt, effectiveBaseFontPt)),
  )
  const meta =
    effectiveBaseFontPt == null
      ? []
      : plain
          .filter(
            (item) =>
              item.sizePt != null &&
              item.sizePt < effectiveBaseFontPt - 0.05 - 1e-9,
          )
          .slice(0, 1)
  return { effectiveBaseFontPt, effectiveSource, body, meta }
}
