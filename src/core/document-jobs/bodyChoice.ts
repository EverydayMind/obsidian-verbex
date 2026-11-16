import type { BodyChoice } from '../report-style/bindingCandidateChoices'

import type { FormatJob } from './jobTypes'

export function selectBodyChoice(job: FormatJob, option: string): BodyChoice {
  if (job.status.state !== 'awaiting_choice')
    throw new Error('Job is not awaiting a choice.')
  const selected = job.status.choices.find((choice) => choice.option === option)
  if (!selected) throw new Error('Invalid body option.')
  return selected
}
