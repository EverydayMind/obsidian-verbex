import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { pendingDocumentQuestions } from '../../core/document-jobs/validJobs'
import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { L } from '../../i18n/modelText'

/** The job exists but still waits on a question: say so, and how to answer. */
export function jobNotReady(job: FormatJob): AgentToolOutcome {
  return toolFailed(
    JSON.stringify({
      state: 'job_not_ready',
      job_id: job.id,
      job_state: job.status.state,
      message: L({
        ko: '이 작업은 아직 준비가 끝나지 않아 분해본을 저장할 수 없습니다. pending_questions가 있으면 prepare_format_reuse에 job_id와 choices(질문마다 option 하나)를 주어 먼저 답하세요.',
        en: 'This job is not ready yet, so its decomposition cannot be saved. If pending_questions are present, answer them first by calling prepare_format_reuse with job_id and choices (one option per question).',
      }),
      pending_questions: pendingDocumentQuestions([job]),
    }),
    { terminal: false, mutationScope: 'none' },
  )
}
