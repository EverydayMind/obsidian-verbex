import { bindingCandidates } from '../report-style/bindingCandidates'
import { representativeRun } from '../report-style/representativeRun'
import type { Binding } from '../report-style/types'

import type { FormatJob, JobState, Measurement } from './jobTypes'

export function selectedBaseFont(job: FormatJob, state: JobState) {
  if (state.state !== 'ready' || job.effectiveSource !== 'symbol_body')
    return {}
  return {
    effectiveBaseFontPt: bodySize(job, state.data.machine?.bindings ?? []),
  }
}
export function bodySize(job: FormatJob, bindings: Binding[]): number | null {
  const ref = bindings.find((item) => item.marker === 'BODY')?.representativeRef
  const candidate = job.candidates?.roles.BODY.find(
    (item) =>
      item.ref === ref ||
      (ref !== undefined && item.alternativeRefs.includes(ref)),
  )
  if (candidate) return candidate.sizePt ?? null
  const paragraph = job.measurement?.snapshot.paragraphs.find(
    (item) => item.ref === ref,
  )
  if (!paragraph || !job.measurement) return null
  const run = representativeRun(paragraph, true)
  const size =
    job.measurement.snapshot.characterStyles[run?.characterStyle ?? -1]?.sizePt
  return size?.state === 'measured' ? size.value : null
}
export function jobBaseContract(job: FormatJob, bindings: Binding[]) {
  const body = bodySize(job, bindings)
  return {
    requested_pt: job.requestedBaseFontPt,
    requested_source: job.baseSource,
    effective_pt:
      job.effectiveSource === 'symbol_body' ? body : job.effectiveBaseFontPt,
    effective_source: job.effectiveSource,
    body_size_pt: body,
  }
}

export function measuredJobBase(job: FormatJob, measurement: Measurement) {
  const candidates = bindingCandidates(
    measurement.snapshot,
    job.requestedBaseFontPt,
  )
  return {
    candidates,
    effectiveBaseFontPt: candidates.effectiveBaseFontPt ?? null,
    effectiveSource: candidates.effectiveSource ?? 'symbol_body',
  }
}
