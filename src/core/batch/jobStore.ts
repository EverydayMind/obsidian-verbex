import { VERBEX_DIR } from '../../constants'
import { sha256Hex } from '../../utils/hash'
import { JobFamilyKey, SourceSnapshot } from '../routing/scopeDecision'

import { SegmentAtom, SegmenterProfile, compareAtomReuse } from './segmenter'

export type BatchJobStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type JobSliceStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'skipped'
  | 'needs_attention'

export type JobStoreSpec = {
  jobId: string
  familyKey: JobFamilyKey
  sourceSnapshot: SourceSnapshot
  createdAt: string
  updatedAt: string
  status: BatchJobStatus
  atoms: SegmentAtom[]
  metadata?: Record<string, unknown>
}

export type JobSliceRecord = {
  kind: 'slice'
  seq: number
  sliceId: string
  revision: number
  status: JobSliceStatus
  result?: string
  packetDeps?: string[]
  updatedAt: string
}

type JobSpecRecord = { kind: 'spec'; seq: number; spec: JobStoreSpec }
type JobStatusRecord = {
  kind: 'job_status'
  seq: number
  status: BatchJobStatus
  updatedAt: string
}
export type JobJournalRecord = JobSpecRecord | JobSliceRecord | JobStatusRecord

export type LoadedJob = {
  spec: JobStoreSpec
  slices: Map<string, JobSliceRecord>
  lastSeq: number
}

export type JobStoreFileAdapter = {
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  write(path: string, data: string): Promise<void>
  append(path: string, data: string): Promise<void>
  mkdir(path: string): Promise<void>
  list(path: string): Promise<{ files: string[]; folders: string[] }>
  remove(path: string): Promise<void>
  rmdir(path: string, recursive: boolean): Promise<void>
  stat(path: string): Promise<{ mtime: number; size: number } | null>
}

export type JobStore = {
  create(spec: JobStoreSpec): Promise<void>
  load(jobId: string): Promise<LoadedJob | null>
  appendSlice(
    jobId: string,
    record: Omit<JobSliceRecord, 'kind' | 'seq'>,
  ): Promise<JobSliceRecord>
  setStatus(jobId: string, status: BatchJobStatus): Promise<void>
  compact(jobId: string): Promise<void>
  findLatestFamily(familyKey: JobFamilyKey): Promise<LoadedJob | null>
}

const JOURNAL_NAME = 'journal.jsonl'

export function parseJobJournal(text: string): JobJournalRecord[] {
  const lines = text.split('\n')
  const records: JobJournalRecord[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line) continue
    try {
      const parsed = JSON.parse(line) as JobJournalRecord
      if (!parsed || typeof parsed.seq !== 'number' || !parsed.kind) {
        throw new Error('invalid record')
      }
      records.push(parsed)
    } catch (error) {
      const hasNonEmptyAfter = lines
        .slice(index + 1)
        .some((item) => item.trim())
      if (!hasNonEmptyAfter) break
      throw new Error(
        `Corrupt job journal record at line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return records.sort((a, b) => a.seq - b.seq)
}

export class JournalJobStore implements JobStore {
  readonly root: string

  constructor(
    private adapter: JobStoreFileAdapter,
    root = `${VERBEX_DIR}/Batch`,
  ) {
    this.root = root
  }

  private jobDir(jobId: string): string {
    if (!/^[\w.-]+$/.test(jobId)) throw new Error(`Unsafe job id: ${jobId}`)
    return `${this.root}/${jobId}`
  }

  private journal(jobId: string): string {
    return `${this.jobDir(jobId)}/${JOURNAL_NAME}`
  }

  private async ensureDir(path: string): Promise<void> {
    const parts = path.split('/')
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      if (!(await this.adapter.exists(current)))
        await this.adapter.mkdir(current)
    }
  }

  async create(spec: JobStoreSpec): Promise<void> {
    const path = this.journal(spec.jobId)
    if (await this.adapter.exists(path)) {
      throw new Error(`Batch job already exists: ${spec.jobId}`)
    }
    await this.ensureDir(this.jobDir(spec.jobId))
    const record: JobSpecRecord = { kind: 'spec', seq: 1, spec }
    await this.adapter.write(path, `${JSON.stringify(record)}\n`)
  }

  async load(jobId: string): Promise<LoadedJob | null> {
    const path = this.journal(jobId)
    if (!(await this.adapter.exists(path))) return null
    const records = parseJobJournal(await this.adapter.read(path))
    const specRecord = records.find(
      (record): record is JobSpecRecord => record.kind === 'spec',
    )
    if (!specRecord) throw new Error(`Batch job has no spec: ${jobId}`)
    const spec = { ...specRecord.spec }
    const slices = new Map<string, JobSliceRecord>()
    for (const record of records) {
      if (record.kind === 'slice') {
        const current = slices.get(record.sliceId)
        if (
          !current ||
          record.revision > current.revision ||
          (record.revision === current.revision && record.seq > current.seq)
        ) {
          slices.set(record.sliceId, record)
        }
      } else if (record.kind === 'job_status') {
        spec.status = record.status
        spec.updatedAt = record.updatedAt
      }
    }
    return {
      spec,
      slices,
      lastSeq: records.at(-1)?.seq ?? 0,
    }
  }

  async appendSlice(
    jobId: string,
    input: Omit<JobSliceRecord, 'kind' | 'seq'>,
  ): Promise<JobSliceRecord> {
    const loaded = await this.load(jobId)
    if (!loaded) throw new Error(`Unknown batch job: ${jobId}`)
    const current = loaded.slices.get(input.sliceId)
    if (current && input.revision < current.revision) return current
    const record: JobSliceRecord = {
      ...input,
      kind: 'slice',
      seq: loaded.lastSeq + 1,
    }
    await this.adapter.append(
      this.journal(jobId),
      `${JSON.stringify(record)}\n`,
    )
    return record
  }

  async setStatus(jobId: string, status: BatchJobStatus): Promise<void> {
    const loaded = await this.load(jobId)
    if (!loaded) throw new Error(`Unknown batch job: ${jobId}`)
    const record: JobStatusRecord = {
      kind: 'job_status',
      seq: loaded.lastSeq + 1,
      status,
      updatedAt: new Date().toISOString(),
    }
    await this.adapter.append(
      this.journal(jobId),
      `${JSON.stringify(record)}\n`,
    )
  }

  async compact(jobId: string): Promise<void> {
    const loaded = await this.load(jobId)
    if (!loaded) return
    let seq = 1
    const records: JobJournalRecord[] = [
      { kind: 'spec', seq: seq++, spec: loaded.spec },
      ...[...loaded.slices.values()]
        .sort((a, b) => a.sliceId.localeCompare(b.sliceId))
        .map((record) => ({ ...record, seq: seq++ })),
    ]
    await this.adapter.write(
      this.journal(jobId),
      `${records.map((record) => JSON.stringify(record)).join('\n')}\n`,
    )
  }

  async findLatestFamily(familyKey: JobFamilyKey): Promise<LoadedJob | null> {
    if (!(await this.adapter.exists(this.root))) return null
    const { folders } = await this.adapter.list(this.root)
    let latest: LoadedJob | null = null
    for (const folder of folders) {
      const jobId = folder.split('/').pop()
      if (!jobId) continue
      const job = await this.load(jobId)
      if (
        job?.spec.familyKey === familyKey &&
        (!latest || job.spec.updatedAt > latest.spec.updatedAt)
      ) {
        latest = job
      }
    }
    return latest
  }

  async acquireFamilyLease(input: {
    familyKey: JobFamilyKey
    owner: string
    now?: Date
    timeoutMs: number
  }): Promise<string | null> {
    const leaseDir = `${this.root}/leases`
    await this.ensureDir(leaseDir)
    const key = await sha256Hex(input.familyKey)
    const path = `${leaseDir}/${key}.json`
    const now = input.now ?? new Date()
    if (await this.adapter.exists(path)) {
      try {
        const current = JSON.parse(await this.adapter.read(path)) as {
          owner: string
          token: string
          acquiredAt: string
        }
        if (
          now.getTime() - Date.parse(current.acquiredAt) < input.timeoutMs &&
          current.owner !== input.owner
        ) {
          return null
        }
      } catch {
        // A corrupt/partial lease is treated as expired and replaced.
      }
    }
    const token = `${input.owner}-${now.getTime()}-${Math.random().toString(36).slice(2)}`
    await this.adapter.write(
      path,
      JSON.stringify({
        owner: input.owner,
        token,
        acquiredAt: now.toISOString(),
      }),
    )
    const confirmed = JSON.parse(await this.adapter.read(path)) as {
      token?: string
    }
    return confirmed.token === token ? token : null
  }

  async releaseFamilyLease(
    familyKey: JobFamilyKey,
    token: string,
  ): Promise<void> {
    const key = await sha256Hex(familyKey)
    const path = `${this.root}/leases/${key}.json`
    if (!(await this.adapter.exists(path))) return
    try {
      const current = JSON.parse(await this.adapter.read(path)) as {
        token?: string
      }
      if (current.token === token) await this.adapter.remove(path)
    } catch {
      // Leave an unreadable lease for timeout recovery.
    }
  }

  async cleanup(input: {
    now?: Date
    ttlMs: number
    quotaBytes: number
  }): Promise<string[]> {
    if (!(await this.adapter.exists(this.root))) return []
    const now = input.now ?? new Date()
    const { folders } = await this.adapter.list(this.root)
    const candidates: { jobId: string; mtime: number; size: number }[] = []
    for (const folder of folders) {
      const jobId = folder.split('/').pop()
      if (!jobId || jobId === 'leases') continue
      const stat = await this.adapter.stat(`${folder}/${JOURNAL_NAME}`)
      if (stat) candidates.push({ jobId, ...stat })
    }
    candidates.sort((a, b) => a.mtime - b.mtime)
    const removed: string[] = []
    let total = candidates.reduce((sum, item) => sum + item.size, 0)
    for (const item of candidates) {
      const expired = now.getTime() - item.mtime >= input.ttlMs
      const overQuota = total > input.quotaBytes
      if (!expired && !overQuota) continue
      await this.adapter.rmdir(this.jobDir(item.jobId), true)
      removed.push(item.jobId)
      total -= item.size
    }
    return removed
  }
}

export async function createJobFamilyKey(input: {
  paths: string[]
  task: string
  workflowId?: string
  stepId?: string
  contractHash: string
  modelId: string
  configHash: string
  engineVersion: string
}): Promise<JobFamilyKey> {
  return sha256Hex(
    JSON.stringify({
      ...input,
      paths: [...input.paths].sort(),
      task: input.task.trim().replace(/\s+/g, ' '),
    }),
  )
}

export function planReusableSlices(input: {
  profile: SegmenterProfile
  previousAtoms: SegmentAtom[]
  nextAtoms: SegmentAtom[]
  previousSlices: Map<string, JobSliceRecord>
  overlap?: boolean
}): { reusableIds: string[]; pendingIds: string[] } {
  const compared = compareAtomReuse({
    profile: input.profile,
    previous: input.previousAtoms,
    next: input.nextAtoms,
    overlap: input.overlap,
  })
  const pending = new Set(compared.invalidatedIds)
  const changedStableIds = new Set(
    input.nextAtoms
      .filter((atom) => pending.has(atom.id))
      .map((atom) => atom.stableId),
  )
  for (const atom of input.nextAtoms) {
    const previous = input.previousSlices.get(atom.id)
    if (
      previous?.packetDeps?.some((dependency) =>
        changedStableIds.has(dependency),
      )
    ) {
      pending.add(atom.id)
    }
    if (previous?.status !== 'done') pending.add(atom.id)
  }
  return {
    reusableIds: input.nextAtoms
      .filter((atom) => !pending.has(atom.id))
      .map((atom) => atom.id),
    pendingIds: input.nextAtoms
      .filter((atom) => pending.has(atom.id))
      .map((atom) => atom.id),
  }
}
