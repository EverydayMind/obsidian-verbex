import {
  type CoverageLedger,
  type CoverageProcessingStatus,
  type CoverageUnit,
  type CoverageUnitRecord,
  createRequirementCoverage,
  withDerivedCoverageState,
} from '../routing/coverage'
import { mapCoverageEntriesToEvidenceRecords } from '../routing/evidenceRecords'

import { BatchPackRecord } from './slicePacking'

export type BatchSliceStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'skipped'
  | 'needs_attention'
  | 'input_empty'
  | 'output_empty'
  | 'truncated'
  | 'stale_input'
  | 'apply_error'
  | 'protocol_error'

export type BatchFactStatus =
  | 'input_empty'
  | 'output_empty'
  | 'truncated'
  | 'stale_input'
  | 'apply_error'
  | 'protocol_error'

export type BatchSliceLease = {
  jobId: string
  acquiredAt: string
}

export type BatchSliceLedgerEntry = {
  id: string
  title: string
  status: BatchSliceStatus
  attempt: number
  inputHash: string
  lease?: BatchSliceLease
  note?: string
  /** Stable context dependencies used to invalidate one-hop consumers. */
  packetDeps?: string[]
  /** Optional revision-bound unit identity for coverage accounting. */
  coverageUnit?: CoverageUnit
}

export type LoadedBatchSlice = {
  body: string
  inputHash: string
  contextPacket?: string
  packetDeps?: string[]
}

export type BatchSliceProgress = {
  entry: BatchSliceLedgerEntry
  index: number
  total: number
  output?: string
  errors?: string[]
}

export type BatchOutcomeClassification = {
  status: BatchFactStatus
  note: string
  errors?: string[]
}

export type BatchInputClassification = {
  status: 'input_empty'
  note: string
  errors?: string[]
}

export type BatchOutcomeInput =
  | {
      stage: 'input'
      entry: BatchSliceLedgerEntry
      slice: LoadedBatchSlice
      expectedHash: string
      actualHash: string
    }
  | {
      stage: 'completion_error'
      entry: BatchSliceLedgerEntry
      slice: LoadedBatchSlice
      error: unknown
    }
  | {
      stage: 'completion'
      entry: BatchSliceLedgerEntry
      slice: LoadedBatchSlice
      completion: BatchCompletionResult
      attemptLimit: number
    }
  | {
      stage: 'commit'
      entry: BatchSliceLedgerEntry
      completedEntry: BatchSliceLedgerEntry
      output: string
      commit: 'partial' | 'failed'
    }

/**
 * Structured completion result (§3.6-3). `finishReason === 'length'` means the
 * output was truncated by the token cap; the runner must never treat such a
 * call as a success, however plausible the text looks.
 */
export type BatchCompletionResult = {
  text: string
  finishReason?: string | null
}

export type ForegroundBatchRunnerDeps = {
  jobId: string
  entries: BatchSliceLedgerEntry[]
  loadSlice: (entry: BatchSliceLedgerEntry) => Promise<LoadedBatchSlice>
  /** One stateless model completion. No tool definitions or chat history. */
  completeSlice: (input: {
    entry: BatchSliceLedgerEntry
    slice: LoadedBatchSlice
    previousErrors: string[]
  }) => Promise<BatchCompletionResult>
  /** Persist a non-terminal ledger transition such as running/attention. */
  persistEntry: (entry: BatchSliceLedgerEntry) => Promise<void>
  /**
   * Atomically persist the output and the supplied done ledger entry through
   * the permission -> approval -> checkpoint -> apply pipeline.
   */
  commitSlice: (input: {
    output: string
    entry: BatchSliceLedgerEntry
    completedEntry: BatchSliceLedgerEntry
  }) => Promise<'applied' | 'partial' | 'failed'>
  classifyOutcome?: (
    input: BatchOutcomeInput,
  ) => BatchOutcomeClassification | undefined
  /** Mechanical input check performed after loading and before the model call. */
  classifyInput?: (input: {
    entry: BatchSliceLedgerEntry
    slice: LoadedBatchSlice
  }) => BatchInputClassification | undefined
  onProgress?: (progress: BatchSliceProgress) => void
  signal?: AbortSignal
  maxAttempts?: number
  now?: () => Date
}

export type ForegroundBatchRunResult = {
  entries: BatchSliceLedgerEntry[]
  completed: number
  needsAttention: number
  statusCounts: Record<BatchSliceStatus, number>
  interrupted: boolean
  completionCalls: number
  terminal: boolean
  completedWithAttention: boolean
}

export function isTerminalBatchStatus(status: BatchSliceStatus): boolean {
  return !['pending', 'running'].includes(status)
}

export function isCompletedBatchStatus(status: BatchSliceStatus): boolean {
  return ['done', 'input_empty', 'output_empty', 'truncated'].includes(status)
}

export type PersistedBatchLedger = {
  schemaVersion: 2
  buildId: string
  jobId: string
  updatedAt: string
  entries: BatchSliceLedgerEntry[]
  /**
   * Non-authoritative pack execution history (§3.6-1). Recorded for
   * reproduction and failure analysis; never consulted for entry status.
   */
  packHistory?: BatchPackRecord[]
  /** Optional generalized coverage view; legacy ledgers omit this field. */
  coverageLedger?: CoverageLedger
}

function toCoverageProcessingStatus(
  status: BatchSliceStatus,
): CoverageProcessingStatus {
  switch (status) {
    case 'skipped':
    case 'needs_attention':
      return 'error'
    default:
      return status
  }
}

/**
 * Attach the generalized coverage view without changing the authoritative
 * batch entry state. The batch ledger remains the source of facts; coverage
 * state is derived from its revision-bound units and statuses.
 */
export function synchronizeBatchCoverageLedger(
  ledger: PersistedBatchLedger,
): PersistedBatchLedger {
  const entriesByUnitId = new Map<
    string,
    BatchSliceLedgerEntry & { coverageUnit: CoverageUnit }
  >()
  for (const entry of ledger.entries) {
    const unit = entry.coverageUnit
    if (unit && !entriesByUnitId.has(unit.unitId)) {
      entriesByUnitId.set(unit.unitId, { ...entry, coverageUnit: unit })
    }
  }
  if (entriesByUnitId.size === 0) return ledger

  const entries = [...entriesByUnitId.values()]
  const units = entries.map((entry) => entry.coverageUnit)
  const previous = ledger.coverageLedger
  const previousRecords = new Map(
    (previous?.records ?? []).map((record) => [record.unit.unitId, record]),
  )
  const records: CoverageUnitRecord[] = entries.map((entry) => {
    const unit = entry.coverageUnit
    const processingStatus = toCoverageProcessingStatus(entry.status)
    const evidenceRefs = previousRecords.get(unit.unitId)?.evidenceRefs
    if (processingStatus === 'done' || processingStatus === 'input_empty') {
      return {
        unit,
        processingStatus,
        ...(evidenceRefs ? { evidenceRefs: [...evidenceRefs] } : {}),
      }
    }
    const previousResolution = previousRecords.get(unit.unitId)
    const previousWaiver =
      previousResolution && 'resolution' in previousResolution
        ? previousResolution.resolution
        : undefined
    return {
      unit,
      processingStatus,
      ...(evidenceRefs ? { evidenceRefs: [...evidenceRefs] } : {}),
      ...(previousWaiver ? { resolution: previousWaiver } : {}),
    }
  })
  const evidenceRecords = mapCoverageEntriesToEvidenceRecords({
    entries: entries.map((entry) => ({
      coverageUnit: entry.coverageUnit,
      processingStatus: toCoverageProcessingStatus(entry.status),
    })),
    previousRecords: previous?.evidenceRecords,
  })
  const inspectedUnits = records
    .filter(
      (record) => !['pending', 'running'].includes(record.processingStatus),
    )
    .map((record) => record.unit)
  const coverage = createRequirementCoverage({
    requirementId: previous?.coverage.requirementId ?? ledger.jobId,
    requiredScope: previous?.coverage.requiredScope ?? 'whole',
    requiredUnits: units,
    candidateUnits: units,
    plannedUnits: units,
    inspectedUnits,
    evidenceRefs: previous?.coverage.evidenceRefs ?? [],
    completeness: previous?.coverage.completeness ?? 'enumerated',
  })
  return {
    ...ledger,
    coverageLedger: {
      schemaVersion: 1,
      coverage: withDerivedCoverageState(coverage, records),
      records,
      evidenceRecords,
    },
  }
}

export function renderBatchLedger(ledger: PersistedBatchLedger): string {
  const persisted = synchronizeBatchCoverageLedger(ledger)
  return [
    '---',
    'verbex_batch_ledger: 2',
    `build_id: "${persisted.buildId.replace(/"/g, '\\"')}"`,
    '---',
    '# Verbex Batch Ledger',
    '',
    '```json',
    JSON.stringify(persisted, null, 2),
    '```',
    '',
  ].join('\n')
}

export function parseBatchLedger(
  markdown: string,
): PersistedBatchLedger | null {
  const match = /```json\s*\n([\s\S]*?)\n```/i.exec(markdown)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as {
      schemaVersion?: number
      buildId?: unknown
      jobId?: unknown
      updatedAt?: unknown
      entries?: (Partial<Omit<BatchSliceLedgerEntry, 'status'>> & {
        status?: unknown
      })[]
      packHistory?: unknown
      coverageLedger?: CoverageLedger
    }
    const markerMatch = /^verbex_batch_ledger:\s*(\d+)\s*$/im.exec(markdown)
    const markerVersion = markerMatch ? Number(markerMatch[1]) : undefined
    const schemaVersion = parsed.schemaVersion
    if (
      (schemaVersion !== 1 && schemaVersion !== 2) ||
      (markerVersion !== undefined && markerVersion !== schemaVersion) ||
      typeof parsed.buildId !== 'string' ||
      typeof parsed.jobId !== 'string' ||
      typeof parsed.updatedAt !== 'string' ||
      !Array.isArray(parsed.entries)
    ) {
      return null
    }
    const validStatuses = new Set<string>([
      'pending',
      'running',
      'done',
      'skipped',
      'needs_attention',
      'input_empty',
      'output_empty',
      'truncated',
      'stale_input',
      'apply_error',
      'protocol_error',
    ])
    if (
      parsed.entries.some(
        (entry) =>
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.title !== 'string' ||
          typeof entry.attempt !== 'number' ||
          typeof entry.inputHash !== 'string' ||
          typeof entry.status !== 'string' ||
          (!validStatuses.has(entry.status) &&
            !(schemaVersion === 1 && entry.status === 'empty')),
      )
    ) {
      return null
    }
    if (
      parsed.packHistory !== undefined &&
      !Array.isArray(parsed.packHistory)
    ) {
      delete parsed.packHistory
    }
    return {
      ...(parsed as Omit<PersistedBatchLedger, 'schemaVersion' | 'entries'>),
      schemaVersion: 2,
      entries: parsed.entries.map((entry) => ({
        ...entry,
        status:
          schemaVersion === 1 && entry.status === 'empty'
            ? 'output_empty'
            : entry.status,
      })) as BatchSliceLedgerEntry[],
    }
  } catch {
    return null
  }
}

function cloneEntry(
  entry: BatchSliceLedgerEntry,
  patch: Partial<BatchSliceLedgerEntry>,
): BatchSliceLedgerEntry {
  return { ...entry, ...patch }
}

export function recoverExpiredBatchLeases(
  entries: BatchSliceLedgerEntry[],
  now: Date,
  leaseTimeoutMs: number,
): BatchSliceLedgerEntry[] {
  return entries.map((entry) => {
    if (entry.status !== 'running' || !entry.lease) return { ...entry }
    const acquiredAt = Date.parse(entry.lease.acquiredAt)
    if (
      Number.isFinite(acquiredAt) &&
      now.getTime() - acquiredAt < leaseTimeoutMs
    ) {
      return { ...entry }
    }
    return cloneEntry(entry, {
      status: 'pending',
      lease: undefined,
      note: 'expired lease recovered',
    })
  })
}

export async function runForegroundBatch(
  deps: ForegroundBatchRunnerDeps,
): Promise<ForegroundBatchRunResult> {
  const entries = deps.entries.map((entry) => ({ ...entry }))
  const maxAttempts = Math.max(1, Math.floor(deps.maxAttempts ?? 2))
  const now = deps.now ?? (() => new Date())
  let completionCalls = 0
  let interrupted = false

  const commitFactualOutcome = async (input: {
    index: number
    output: string
    running: BatchSliceLedgerEntry
    status: BatchFactStatus
    note: string
    slice?: LoadedBatchSlice
    errors?: string[]
  }): Promise<void> => {
    const factEntry = cloneEntry(input.running, {
      status: input.status,
      lease: undefined,
      note: input.note,
      ...(input.slice ? { packetDeps: input.slice.packetDeps } : {}),
    })
    if (
      input.status === 'input_empty' ||
      input.status === 'output_empty' ||
      input.status === 'truncated'
    ) {
      const commit = await deps.commitSlice({
        output: input.output,
        entry: input.running,
        completedEntry: factEntry,
      })
      if (commit === 'applied') {
        entries[input.index] = factEntry
        deps.onProgress?.({
          entry: factEntry,
          index: input.index + 1,
          total: entries.length,
          output: input.output,
          errors: input.errors,
        })
        return
      }
      const classified = deps.classifyOutcome?.({
        stage: 'commit',
        entry: input.running,
        completedEntry: factEntry,
        output: input.output,
        commit,
      }) ?? {
        status: 'apply_error' as const,
        note: `commit ${commit}`,
        errors: [`commit ${commit}`],
      }
      await commitFactualOutcome({
        index: input.index,
        output: '',
        running: input.running,
        status: classified.status,
        note: classified.note,
        errors: classified.errors,
      })
      return
    }
    entries[input.index] = factEntry
    await deps.persistEntry(factEntry)
    deps.onProgress?.({
      entry: factEntry,
      index: input.index + 1,
      total: entries.length,
      output: input.output,
      errors: input.errors,
    })
  }

  for (let index = 0; index < entries.length; index += 1) {
    if (deps.signal?.aborted) {
      interrupted = true
      break
    }
    const current = entries[index]
    if (current.status !== 'pending') continue
    const attemptLimit = current.attempt + maxAttempts

    let running = cloneEntry(current, {
      status: 'running',
      attempt: current.attempt + 1,
      lease: { jobId: deps.jobId, acquiredAt: now().toISOString() },
      note: undefined,
    })
    entries[index] = running
    await deps.persistEntry(running)

    const slice = await deps.loadSlice(running)
    if (slice.inputHash !== running.inputHash) {
      const classified = deps.classifyOutcome?.({
        stage: 'input',
        entry: running,
        slice,
        expectedHash: running.inputHash,
        actualHash: slice.inputHash,
      }) ?? {
        status: 'stale_input' as const,
        note: `input hash changed: expected ${running.inputHash}, got ${slice.inputHash}`,
      }
      await commitFactualOutcome({
        index,
        output: '',
        running,
        status: classified.status,
        note: classified.note,
        slice,
        errors: classified.errors,
      })
      continue
    }

    const inputClassification = deps.classifyInput?.({
      entry: running,
      slice,
    })
    if (inputClassification) {
      await commitFactualOutcome({
        index,
        output: '',
        running,
        status: inputClassification.status,
        note: inputClassification.note,
        slice,
        errors: inputClassification.errors,
      })
      continue
    }

    let previousErrors: string[] = []
    let output = ''
    while (running.attempt <= attemptLimit) {
      if (deps.signal?.aborted) {
        interrupted = true
        break
      }
      let completion: BatchCompletionResult
      try {
        completion = await deps.completeSlice({
          entry: running,
          slice,
          previousErrors,
        })
      } catch (error) {
        if (deps.signal?.aborted) {
          interrupted = true
          break
        }
        const message = error instanceof Error ? error.message : String(error)
        const classified = deps.classifyOutcome?.({
          stage: 'completion_error',
          entry: running,
          slice,
          error,
        }) ?? {
          status: 'protocol_error' as const,
          note: message,
          errors: [message],
        }
        await commitFactualOutcome({
          index,
          output,
          running,
          status: classified.status,
          note: classified.note,
          slice,
          errors: classified.errors,
        })
        previousErrors = classified.errors ?? [classified.note]
        break
      }
      completionCalls += 1
      output = completion.text
      const factualCompletion =
        deps.classifyOutcome?.({
          stage: 'completion',
          entry: running,
          slice,
          completion,
          attemptLimit,
        }) ??
        (completion.finishReason === 'length'
          ? {
              status: 'truncated' as const,
              note: 'finish_reason=length',
              errors: ['finish_reason=length'],
            }
          : output.trim().length === 0
            ? {
                status: 'output_empty' as const,
                note: 'empty model output',
                errors: ['empty model output'],
              }
            : undefined)
      if (factualCompletion) {
        if (
          factualCompletion.status === 'truncated' &&
          running.attempt < attemptLimit
        ) {
          running = cloneEntry(running, {
            attempt: running.attempt + 1,
            lease: { jobId: deps.jobId, acquiredAt: now().toISOString() },
            note: factualCompletion.note,
          })
          entries[index] = running
          await deps.persistEntry(running)
          continue
        }
        await commitFactualOutcome({
          index,
          output,
          running,
          status: factualCompletion.status,
          note: factualCompletion.note,
          slice,
          errors: factualCompletion.errors,
        })
        previousErrors = factualCompletion.errors ?? []
        break
      }
      previousErrors = []
      break
    }
    if (
      interrupted ||
      isTerminalBatchStatus(entries[index].status) ||
      previousErrors.length > 0
    )
      continue

    const completedEntry = cloneEntry(running, {
      status: 'done',
      lease: undefined,
      note: undefined,
      packetDeps: slice.packetDeps,
    })
    const commit = await deps.commitSlice({
      output,
      entry: running,
      completedEntry,
    })
    if (commit === 'applied') {
      entries[index] = completedEntry
      deps.onProgress?.({
        entry: completedEntry,
        index: index + 1,
        total: entries.length,
        output,
      })
    } else {
      const classified = deps.classifyOutcome?.({
        stage: 'commit',
        entry: running,
        completedEntry,
        output,
        commit,
      }) ?? {
        status: 'apply_error' as const,
        note: `commit ${commit}`,
        errors: [`commit ${commit}`],
      }
      await commitFactualOutcome({
        index,
        output: '',
        running,
        status: classified.status,
        note: classified.note,
        errors: classified.errors,
      })
    }
  }

  const statusCounts = Object.fromEntries(
    (
      [
        'pending',
        'running',
        'done',
        'skipped',
        'needs_attention',
        'input_empty',
        'output_empty',
        'truncated',
        'stale_input',
        'apply_error',
        'protocol_error',
      ] as BatchSliceStatus[]
    ).map((status) => [
      status,
      entries.filter((entry) => entry.status === status).length,
    ]),
  ) as Record<BatchSliceStatus, number>

  return {
    entries,
    completed: entries.filter((entry) => isCompletedBatchStatus(entry.status))
      .length,
    needsAttention: statusCounts.needs_attention,
    statusCounts,
    interrupted,
    completionCalls,
    terminal: entries.every((entry) => isTerminalBatchStatus(entry.status)),
    completedWithAttention: statusCounts.needs_attention > 0,
  }
}
