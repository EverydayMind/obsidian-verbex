import type { App } from 'obsidian'

import { baseFontPt } from '../../core/document-jobs/baseFont'
import { selectBodyChoice } from '../../core/document-jobs/bodyChoice'
import { DocumentJobStore } from '../../core/document-jobs/jobStore'
import { validDocumentJobs } from '../../core/document-jobs/validJobs'

import { copyJson } from './descriptorReader'
import {
  chooseDocumentJobBody,
  revalidateBodyChoiceJob,
  validateDocumentJobChoice,
} from './documentJobBodyChoice'
import { documentJobFileHash } from './documentJobFileHash'
import {
  invalidPrepare,
  requirePrepareRequest,
} from './documentJobPrepareFacts'
import { finishDocumentJob } from './documentJobPrepareFinish'
import { recordPreparedDecomposition } from './documentJobPrepareReady'
import { rememberDocumentJobRequest } from './documentJobRequestContext'
import { jobStatusResult } from './documentJobStatus'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import type { JsonObject } from './protocol'
import { startPreparedDocumentJob } from './startPreparedDocumentJob'

export type PrepareRequest =
  | { sample_path: string; output_name?: string; base_font_pt?: number }
  | { job_id: string; choices: [{ question: 'body'; option: string }] }

export { InvalidDocumentJobPrepareRequest } from './documentJobPrepareFacts'

/** Host service: requests are copied and validated before any file access. */
export class DocumentJobPrepare {
  private readonly busy = new Set<string>()
  rememberRequest(conversationId: string, request: string): void {
    rememberDocumentJobRequest(this, conversationId, request)
  }
  constructor(
    private readonly app: App,
    private readonly host: HostContext,
    private readonly options: NativeHostOptions,
    readonly store = new DocumentJobStore(),
  ) {}

  currentBaseFontPt(): number {
    return baseFontPt(this.options.documentJobBaseFontPt?.())
  }

  async byteHash(path: string): Promise<string> {
    return documentJobFileHash(this.host, this.host.vaultPath(path))
  }

  private validJobs(
    conversationId: string,
    jobId?: string,
    signal?: AbortSignal,
  ) {
    return validDocumentJobs({
      store: this.store,
      conversationId,
      jobId,
      hash: (path) => this.byteHash(path),
      signal,
    })
  }

  async prepare(
    request: PrepareRequest,
    conversationId: string,
    signal?: AbortSignal,
  ): Promise<JsonObject> {
    if (!conversationId) throw new Error('Conversation is required.')
    const safe = copyJson(request, {
      maxDepth: 8,
      maxNodes: 100,
      maxBytes: 32 * 1024,
    })
    request = await requirePrepareRequest(safe, (jobId) =>
      this.validJobs(conversationId, jobId, signal),
    )
    const job =
      'sample_path' in request
        ? await startPreparedDocumentJob({
            host: this.host,
            options: this.options,
            store: this.store,
            request,
            conversationId,
            baseFontPt: this.currentBaseFontPt(),
            signal,
          })
        : (await this.validJobs(conversationId, request.job_id, signal))[0]
    if (!job) invalidPrepare([{ field: 'job_id', problem: 'unknown_job' }])
    if ('choices' in request)
      validateDocumentJobChoice(job, request.choices[0].option)
    if (this.busy.has(job.id)) throw new Error('Job is busy; retry prepare.')
    this.busy.add(job.id)
    try {
      if (job.status.state === 'blocked' || job.status.state === 'ready')
        return jobStatusResult(job, this.host)
      let chosenBy: 'rule' | 'user' | 'model' =
        'choices' in request ? 'model' : 'rule'
      let selectedOption =
        'choices' in request ? request.choices[0].option : undefined
      const finish = async (current: typeof job) => {
        const bodyRef =
          current.status.state === 'awaiting_choice'
            ? selectBodyChoice(current, selectedOption ?? '').ref
            : current.candidates?.roles.BODY[0]?.ref
        if (!bodyRef || !current.measurement)
          throw new Error('Job measurement unavailable.')
        const ready = await finishDocumentJob({
          app: this.app,
          host: this.host,
          options: this.options,
          store: this.store,
          job: current,
          bodyRef,
          chosenBy,
          selectedOption,
          signal,
          byteHash: (path) => this.byteHash(path),
        })
        recordPreparedDecomposition(this, this.store, ready, conversationId)
        return ready
      }
      let result =
        job.status.state === 'awaiting_choice' && 'sample_path' in request
          ? job
          : await finish(job)
      if (
        'sample_path' in request &&
        result.status.state === 'awaiting_choice' &&
        this.options.documentJobBodyChoice
      ) {
        const option = await chooseDocumentJobBody(
          result,
          this.options.documentJobBodyChoice,
          signal,
        )
        if (!option) return jobStatusResult(result, this.host)
        const current = await revalidateBodyChoiceJob(
          () => this.validJobs(conversationId, result.id, signal),
          signal,
        )
        if (!current) return jobStatusResult(result, this.host)
        chosenBy = 'user'
        selectedOption = option
        result = await finish(current)
      }
      return jobStatusResult(result, this.host)
    } finally {
      this.busy.delete(job.id)
    }
  }
}
