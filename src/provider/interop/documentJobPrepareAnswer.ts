import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { pendingDocumentQuestions } from '../../core/document-jobs/validJobs'

/**
 * A call that carries choices for a job that is waiting on a question is an
 * answer, whatever else it repeats. The new-job fields a model copies along
 * (sample_path, output_name, base_font_pt) are dropped, and a missing job_id
 * is filled when exactly one job is waiting. Anything else is left for the
 * strict form check.
 */
export async function answerToPendingQuestion(
  value: unknown,
  jobs: (jobId?: string) => Promise<FormatJob[]>,
): Promise<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const request = value as Record<string, unknown>
  if (!Array.isArray(request.choices) || !request.choices.length) return value
  const given = typeof request.job_id === 'string' ? request.job_id : undefined
  if (request.job_id !== undefined && !given) return value
  const waiting = pendingDocumentQuestions(await jobs(given))
  const jobId = given
    ? waiting.find((item) => item.job_id === given)?.job_id
    : waiting.length === 1
      ? waiting[0].job_id
      : undefined
  if (!jobId) return value
  return { job_id: jobId, choices: request.choices }
}
