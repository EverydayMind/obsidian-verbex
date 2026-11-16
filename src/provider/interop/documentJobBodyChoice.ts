import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { invalidPrepare } from './documentJobPrepareFacts'
import type { NativeHostOptions } from './hostOptions'

/** Holds the prepare lock while the human decides; no state changes on dismissal. */
export async function chooseDocumentJobBody(
  job: FormatJob,
  chooser: NonNullable<NativeHostOptions['documentJobBodyChoice']>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (job.status.state !== 'awaiting_choice') return null
  const choices = job.status.choices
  try {
    const option = await chooser(
      {
        samplePath: job.samplePath,
        jobId: job.id,
        choices: choices.map(
          ({ option, prefix, paragraphs, spacingPt, preview }) => ({
            option,
            prefix,
            paragraphs,
            spacingPt,
            preview,
          }),
        ),
      },
      signal,
    )
    return !signal?.aborted &&
      option &&
      choices.some((choice) => choice.option === option)
      ? option
      : null
  } catch {
    return null
  }
}

export function validateDocumentJobChoice(
  job: FormatJob,
  option: string,
): void {
  if (job.status.state !== 'awaiting_choice' && job.status.state !== 'ready')
    invalidPrepare([{ field: 'choices', problem: 'no_pending_question' }])
  if (
    !job.choices?.some((choice) => choice.option === option) ||
    (job.status.state === 'ready' && job.status.data.selectedOption !== option)
  )
    invalidPrepare(
      [{ field: 'choices.option', problem: 'option_not_offered' }],
      [job],
    )
}

export async function revalidateBodyChoiceJob(
  load: () => Promise<FormatJob[]>,
  signal?: AbortSignal,
): Promise<FormatJob | undefined> {
  try {
    const job = (await load())[0]
    return !signal?.aborted && job?.status.state === 'awaiting_choice'
      ? job
      : undefined
  } catch (error) {
    if (signal?.aborted) return undefined
    throw error
  }
}
