import type { FormatJob } from './jobTypes'

export function boundJobPath(job: FormatJob): string {
  if (job.kind !== 'template') return job.samplePath
  if (
    job.status.state === 'blocked' &&
    typeof job.status.details?.template_path === 'string'
  )
    return job.status.details.template_path
  if (job.status.state !== 'ready' || !job.status.data.template)
    throw new Error('Template binding required.')
  return job.status.data.template.path
}
