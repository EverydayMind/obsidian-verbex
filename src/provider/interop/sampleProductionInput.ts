import type {
  FormatJob,
  ProductionKey,
} from '../../core/document-jobs/jobTypes'

import type { JsonObject } from './protocol'

export function sampleProductionInput(
  job: FormatJob,
  request: { draft_path: string; output_path: string },
  draftSha: string,
) {
  if (job.status.state !== 'ready') throw new Error('Job is not ready.')
  const data = job.status.data,
    derivationSha = data.bundle.derivation_sha256
  if (typeof derivationSha !== 'string')
    throw new Error('Missing derivation identity.')
  const bundle = JSON.parse(JSON.stringify(data.bundle)) as JsonObject
  const key: ProductionKey = {
    jobId: job.id,
    draftPath: request.draft_path,
    draftSha256: draftSha,
    derivationSha256: derivationSha,
    outputPath: request.output_path,
  }
  return { bundle, key, derivationSha }
}
