import type { JsonObject } from '../../provider/interop/protocol'

import { createFormatJob } from './createFormatJob'
import type { NewJobInput } from './jobBase'
import { bindMeasurement, transitionJob } from './jobTransitions'
import {
  type FormatJob,
  JOB_TTL,
  type JobState,
  type Measurement,
  type MeasurementKey,
  type ProductionKey,
  copy,
} from './jobTypes'
import { MeasurementCache } from './measurementCache'
import { ProductionStore } from './productionStore'
import { boundJobPath } from './readyJob'
import { activeDocumentJobCandidates } from './validJobs'

/** Transient data only; unresolved writes are guarded by persistent checkpoints. */
export class DocumentJobStore {
  private readonly cache: MeasurementCache
  private readonly jobs = new Map<string, FormatJob>()
  private readonly latest = new Map<string, string>()
  private readonly productions = new ProductionStore()
  constructor(private readonly now: () => number = Date.now) {
    this.cache = new MeasurementCache(now)
  }
  private expire(): void {
    for (const [id, job] of this.jobs)
      if (job.expiresAt <= this.now()) {
        this.jobs.delete(id)
        this.productions.deleteJob(id)
      }
  }
  /** Candidate jobs still require current sample hash validation by the caller. */
  activeJobs(conversationId: string): FormatJob[] {
    this.expire()
    return activeDocumentJobCandidates(this.jobs.values(), conversationId)
  }
  /** Detached jobs in creation order; no expired or other-conversation jobs. */
  conversationJobs(conversationId: string): FormatJob[] {
    this.expire()
    return [...this.jobs.values()]
      .filter((job) => job.conversationId === conversationId)
      .map(copy)
  }

  findMeasurement(key: MeasurementKey): Measurement | undefined {
    return this.cache.find(key)
  }
  cacheMeasurement(key: MeasurementKey, value: Measurement): void {
    this.cache.put(key, value)
  }

  latestJobId(conversationId: string): string | undefined {
    return this.latest.get(conversationId)
  }
  createJob(
    input: NewJobInput,
    templateData?: import('./jobTypes').ReadyData,
  ): FormatJob {
    this.expire()
    const job = createFormatJob(input, this.now() + JOB_TTL, templateData)
    if (this.jobs.has(job.id)) throw new Error('Job ID collision.')
    this.jobs.set(job.id, copy(job))
    this.latest.set(job.conversationId, job.id)
    return copy(job)
  }

  bindMeasurement(
    id: string,
    conversationId: string,
    sampleSha256: string,
    measurement: Measurement,
  ): FormatJob {
    const updated = bindMeasurement(
      this.getJob(id, conversationId, sampleSha256),
      measurement,
    )
    this.jobs.set(id, updated)
    return copy(updated)
  }

  /** The caller must hash the sample again before every lookup. */
  getJob(
    id: string,
    conversationId: string,
    currentSampleSha256: string,
  ): FormatJob {
    this.expire()
    const job = this.jobs.get(id)
    if (!job || job.conversationId !== conversationId)
      throw new Error('Job unavailable or expired.')
    if (job.kind !== 'template' && job.sampleSha256 !== currentSampleSha256) {
      this.jobs.delete(id)
      this.productions.deleteJob(id)
      throw new Error('Job sample changed.')
    }
    return copy(job)
  }

  /** Only exposes the bound path so callers can hash it before accessing the job. */
  sourcePath(id: string, conversationId: string): string {
    this.expire()
    const job = this.jobs.get(id)
    if (!job || job.conversationId !== conversationId)
      throw new Error('Job unavailable or expired.')
    return boundJobPath(job)
  }

  transition(
    id: string,
    conversationId: string,
    sampleSha256: string,
    next: Exclude<JobState, { state: 'measured' | 'measuring' }>,
  ): FormatJob {
    const updated = transitionJob(
      this.getJob(id, conversationId, sampleSha256),
      next,
    )
    this.jobs.set(id, updated)
    return copy(updated)
  }

  hasProduction(jobId: string): boolean {
    this.expire()
    return this.productions.hasJob(jobId)
  }

  recordProduced(
    conversationId: string,
    sampleSha256: string,
    key: ProductionKey,
    sha256: string,
    receipt: JsonObject,
  ): void {
    this.productions.record(
      this.getJob(key.jobId, conversationId, sampleSha256),
      key,
      sha256,
      receipt,
    )
  }
  /** Call only after the persistent output guard; an unreadable file must throw. */
  async previousProduction(
    conversationId: string,
    sampleSha256: string,
    key: ProductionKey,
    readHash: (path: string) => Promise<string | null>,
  ) {
    const job = this.getJob(key.jobId, conversationId, sampleSha256)
    if (job.status.state !== 'ready') throw new Error('Job is not ready.')
    return this.productions.previous(key, readHash, () => {
      this.getJob(key.jobId, conversationId, sampleSha256)
    })
  }
}
