import { runtimeGlobal } from '../../platform/runtime'

import { type NewJobInput, newJobBase } from './jobBase'
import { type FormatJob, type ReadyData, SHA } from './jobTypes'
import { readyJob } from './readyJob'

/** Job allocation owns binding validation; the store owns creation order. */
export function createFormatJob(
  input: NewJobInput,
  expiresAt: number,
  templateData?: ReadyData,
): FormatJob {
  if (
    !input.conversationId ||
    !input.samplePath ||
    !SHA.test(input.sampleSha256) ||
    !Number.isSafeInteger(input.apiVersion) ||
    input.apiVersion < 0
  )
    throw new Error('Invalid job binding.')
  const job: FormatJob = {
    ...input,
    kind: input.kind ?? 'sample',
    ...newJobBase(input),
    id: `fr-${runtimeGlobal().crypto.randomUUID()}`,
    expiresAt,
    measurement: null,
    status: { state: 'measuring' },
  }
  return templateData ? readyJob(job, templateData, true) : job
}
