import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { documentJobNextStep } from './documentJobDraftInput'

export function renamedDraftArguments(job: FormatJob, path: string) {
  const args = documentJobNextStep(job).arguments
  const name = (path.split('/').pop() ?? '').replace(/\.md$/i, '')
  const folder = args.output_path.split('/').slice(0, -1)
  return {
    ...args,
    draft_path: path,
    output_path: [...folder, `${name}.hwpx`].join('/'),
  }
}
