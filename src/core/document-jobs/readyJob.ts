import { type FormatJob, type ReadyData, SHA, copy } from './jobTypes'

export { boundJobPath } from './boundJobPath'

/** Enrich an already-ready job, or initialize the measurement-free template kind. */
export function readyJob(
  job: FormatJob,
  data: ReadyData,
  template = false,
): FormatJob {
  if (
    !(
      job.status.state === 'ready' ||
      (job.kind === 'template' && job.status.state === 'measuring')
    )
  )
    throw new Error('Job is not ready.')
  if (
    (template || job.kind === 'template') &&
    (!data.template?.path || !/^[a-f0-9]{64}$/.test(data.template.sha256))
  )
    throw new Error('Template binding required.')
  if (job.kind === 'sample') assertSampleReadyJob(job, data)
  if (
    job.kind === 'template' &&
    job.status.state === 'ready' &&
    data.template?.path !== job.status.data.template?.path
  )
    throw new Error('Job template path changed.')
  return {
    ...job,
    kind: template ? 'template' : job.kind,
    status: { state: 'ready', data: copy(data) },
  }
}

export function assertSampleReadyJob(
  current: FormatJob,
  data: ReadyData,
): void {
  if (
    !current.measurement ||
    !data.machine ||
    !SHA.test(data.descriptorDigest) ||
    !Number.isSafeInteger(data.policyRevision) ||
    data.policyRevision < 0 ||
    !data.draftPath ||
    !data.outputPath ||
    data.bundle.sample_path !== current.samplePath ||
    data.bundle.expected_sample_sha256 !== current.sampleSha256 ||
    typeof data.bundle.derivation_sha256 !== 'string' ||
    !SHA.test(data.bundle.derivation_sha256) ||
    data.machine.sourcePath !== current.samplePath ||
    data.machine.snapshot.source.sha256 !== current.sampleSha256 ||
    data.machine.measurementSha256 !== current.measurement.measurementSha256
  )
    throw new Error('Invalid ready job binding.')
}
