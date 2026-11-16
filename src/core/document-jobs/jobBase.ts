import { baseFontPt } from './baseFont'
import type { FormatJob } from './jobTypes'

export type NewJobInput = Omit<
  FormatJob,
  | 'id'
  | 'expiresAt'
  | 'status'
  | 'measurement'
  | 'candidates'
  | 'effectiveSource'
  | 'effectiveBaseFontPt'
  | 'requestedBaseFontPt'
  | 'baseSource'
  | 'kind'
> &
  Partial<Pick<FormatJob, 'requestedBaseFontPt' | 'baseSource' | 'kind'>>
export function newJobBase(input: NewJobInput) {
  return {
    requestedBaseFontPt: baseFontPt(input.requestedBaseFontPt),
    baseSource: input.baseSource ?? 'setting',
    candidates: null,
    effectiveBaseFontPt: null,
    effectiveSource: 'symbol_body' as const,
  }
}
