import type { Model } from '../../core/document-jobs/decompose/types'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { makeBodyChoices } from '../../core/report-style/bindingCandidateChoices'
import { getStyleApi } from '../../core/report-style/kordocStyleApi'
import { significantBodyCandidates } from '../../core/report-style/significantBodyCandidates'

import type { HostContext } from './editorActions'

/** Reuse the existing bound previews, option IDs and question state. */
export async function decompositionBodyChoice(
  host: HostContext,
  job: FormatJob,
  model: Model,
  signal?: AbortSignal,
) {
  if (!job.measurement) throw new Error('Job measurement unavailable.')
  const choices = await makeBodyChoices({
    api: getStyleApi(host.app),
    path: job.samplePath,
    sourceSha256: job.sampleSha256,
    measurementSha256: job.measurement.measurementSha256,
    jobId: job.id,
    candidates: significantBodyCandidates(model.bodyCandidates).slice(0, 5),
    signal,
  })
  return { state: 'awaiting_choice' as const, choices }
}
