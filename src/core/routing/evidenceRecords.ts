import type { ChunkLocator } from '../rag/retrievalTypes'

export type EvidenceRecordBase = {
  /** Same stable key as the source CoverageUnit / ChunkLocator. */
  unitId: string
  path: string
  startLine: number
  endLine: number
  /** Optional model judgement. The harness never derives this from prose. */
  modelFinding?: 'evidence' | 'no_finding' | 'uncertain'
  exactQuote?: string
  outputRef?: string
}

export type EvidenceRecord =
  | (EvidenceRecordBase & {
      processingStatus: 'done' | 'input_empty'
      resolution?: never
    })
  | (EvidenceRecordBase & {
      processingStatus:
        | 'output_empty'
        | 'truncated'
        | 'stale_input'
        | 'protocol_error'
        | 'apply_error'
        | 'error'
      resolution?: 'waived_by_user'
    })

export type EvidenceRecordProcessingStatus = EvidenceRecord['processingStatus']

export type EvidenceRecordSourceStatus =
  | EvidenceRecordProcessingStatus
  | 'pending'
  | 'running'
  | 'skipped'
  | 'needs_attention'

export type EvidenceRecordMapInput = EvidenceRecordBase & {
  processingStatus: EvidenceRecordSourceStatus
  resolution?: 'waived_by_user'
}

export type EvidenceCoverageSummary = {
  /** Number of planned units, not the number of retrieved candidates. */
  totalUnits: number
  /** Units whose processing status is done or input_empty. */
  coverageSatisfied: number
  /** Units closed by an explicit user waiver. */
  exceptionClosed: number
  /** Units that are neither satisfied nor explicitly waived. */
  reprocessRequired: number
  /** Records actually included in the downstream prompt. */
  deliveredRecordCount: number
}

export type EvidenceRecordReduction = {
  records: EvidenceRecord[]
  summary: EvidenceCoverageSummary
}

/**
 * Convert one ledger fact into the §5.5 EvidenceRecord contract.
 *
 * Pending/running entries are intentionally omitted: they are execution-plan
 * states, not evidence records. Legacy skipped/needs_attention states are
 * normalized to the factual `error` bucket without judging the model text.
 */
export function mapCoverageFactToEvidenceRecord(
  input: EvidenceRecordMapInput,
): EvidenceRecord | null {
  const processingStatus = normalizeEvidenceProcessingStatus(
    input.processingStatus,
  )
  if (!processingStatus) return null

  const base: EvidenceRecordBase = {
    unitId: input.unitId,
    path: input.path,
    startLine: input.startLine,
    endLine: input.endLine,
    ...(input.modelFinding ? { modelFinding: input.modelFinding } : {}),
    ...(input.exactQuote !== undefined ? { exactQuote: input.exactQuote } : {}),
    ...(input.outputRef !== undefined ? { outputRef: input.outputRef } : {}),
  }

  if (processingStatus === 'done' || processingStatus === 'input_empty') {
    return { ...base, processingStatus }
  }
  return {
    ...base,
    processingStatus,
    ...(input.resolution ? { resolution: input.resolution } : {}),
  }
}

export function normalizeEvidenceProcessingStatus(
  status: EvidenceRecordSourceStatus,
): EvidenceRecordProcessingStatus | null {
  switch (status) {
    case 'pending':
    case 'running':
      return null
    case 'skipped':
    case 'needs_attention':
      return 'error'
    default:
      return status
  }
}

export function mapCoverageEntriesToEvidenceRecords(input: {
  entries: readonly {
    coverageUnit?: ChunkLocator
    processingStatus: EvidenceRecordSourceStatus
  }[]
  previousRecords?: readonly EvidenceRecord[]
}): EvidenceRecord[] {
  const previousByUnitId = new Map(
    (input.previousRecords ?? []).map((record) => [record.unitId, record]),
  )
  return input.entries.flatMap((entry) => {
    const unit = entry.coverageUnit
    if (!unit) return []
    const previous = previousByUnitId.get(unit.unitId)
    const record = mapCoverageFactToEvidenceRecord({
      ...unit,
      processingStatus: entry.processingStatus,
      ...(previous?.modelFinding
        ? { modelFinding: previous.modelFinding }
        : {}),
      ...(previous?.exactQuote !== undefined
        ? { exactQuote: previous.exactQuote }
        : {}),
      ...(previous?.outputRef !== undefined
        ? { outputRef: previous.outputRef }
        : {}),
      ...(previous && 'resolution' in previous
        ? { resolution: previous.resolution }
        : {}),
    })
    return record ? [record] : []
  })
}

export function isCoverageSatisfied(record: EvidenceRecord): boolean {
  return (
    record.processingStatus === 'done' ||
    record.processingStatus === 'input_empty'
  )
}

export function isCoverageResolved(record: EvidenceRecord): boolean {
  return (
    isCoverageSatisfied(record) ||
    ('resolution' in record && record.resolution === 'waived_by_user')
  )
}

/**
 * Deterministically reduce mapped records for a downstream synthesizer.
 *
 * The last record for a duplicated unitId wins because ledger updates are
 * ordered facts. Missing planned units remain in the denominator and count as
 * reprocessRequired; they are never silently treated as covered.
 */
export function reduceEvidenceRecords(input: {
  records: readonly EvidenceRecord[]
  plannedUnitIds?: readonly string[]
  deliveredUnitIds?: readonly string[]
}): EvidenceRecordReduction {
  const recordsByUnitId = new Map<string, EvidenceRecord>()
  const order: string[] = []
  for (const record of input.records) {
    if (!recordsByUnitId.has(record.unitId)) order.push(record.unitId)
    recordsByUnitId.set(record.unitId, record)
  }
  const records = order
    .map((unitId) => recordsByUnitId.get(unitId))
    .filter((record): record is EvidenceRecord => Boolean(record))

  const plannedUnitIds = uniqueStrings(
    input.plannedUnitIds ?? records.map((record) => record.unitId),
  )
  let coverageSatisfied = 0
  let exceptionClosed = 0
  for (const unitId of plannedUnitIds) {
    const record = recordsByUnitId.get(unitId)
    if (!record) continue
    if (isCoverageSatisfied(record)) {
      coverageSatisfied += 1
    } else if (isCoverageResolved(record)) {
      exceptionClosed += 1
    }
  }
  const deliveredUnitIds = uniqueStrings(
    input.deliveredUnitIds ?? records.map((record) => record.unitId),
  )
  const deliveredRecordCount = deliveredUnitIds.filter((unitId) =>
    recordsByUnitId.has(unitId),
  ).length

  return {
    records,
    summary: {
      totalUnits: plannedUnitIds.length,
      coverageSatisfied,
      exceptionClosed,
      reprocessRequired:
        plannedUnitIds.length - coverageSatisfied - exceptionClosed,
      deliveredRecordCount,
    },
  }
}

/**
 * Render only factual record data and mutually exclusive counts. This is a
 * presentation helper for a final LLM prompt; it does not validate or rewrite
 * the model's prose and therefore cannot change the record's fate.
 */
export function renderEvidenceRecordsForPrompt(
  reduction: EvidenceRecordReduction,
  options: { compact?: boolean } = {},
): string {
  const summary = reduction.summary
  const records = options.compact
    ? reduction.records
        .map(
          (record) =>
            `- ${record.unitId} [${record.processingStatus}]${
              'resolution' in record && record.resolution
                ? ` (${record.resolution})`
                : ''
            }`,
        )
        .join('\n')
    : reduction.records.map((record) => JSON.stringify(record)).join('\n')
  return [
    '## Evidence coverage (mechanical ledger)',
    `total_units: ${summary.totalUnits}`,
    `coverage_satisfied: ${summary.coverageSatisfied}`,
    `exception_closed: ${summary.exceptionClosed}`,
    `reprocess_required: ${summary.reprocessRequired}`,
    `delivered_record_count: ${summary.deliveredRecordCount}`,
    '',
    '## EvidenceRecord',
    records || '(no terminal evidence records delivered)',
  ].join('\n')
}

/** Parse optional cached metadata without allowing malformed records to enter the ledger. */
export function parseEvidenceRecords(value: unknown): EvidenceRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter(isEvidenceRecord)
}

export function evidenceRecordFromChunk(
  unit: ChunkLocator,
  processingStatus: EvidenceRecordProcessingStatus,
  extra: Pick<
    EvidenceRecordBase,
    'exactQuote' | 'outputRef' | 'modelFinding'
  > = {},
): EvidenceRecord {
  const record = mapCoverageFactToEvidenceRecord({
    ...unit,
    processingStatus,
    ...extra,
  })
  if (!record) {
    throw new Error(`chunk evidence record is not terminal: ${unit.unitId}`)
  }
  return record
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<EvidenceRecordBase> & {
    processingStatus?: unknown
    resolution?: unknown
  }
  if (
    typeof record.unitId !== 'string' ||
    typeof record.path !== 'string' ||
    !Number.isInteger(record.startLine) ||
    !Number.isInteger(record.endLine) ||
    typeof record.processingStatus !== 'string'
  ) {
    return false
  }
  const validStatuses = new Set<EvidenceRecordProcessingStatus>([
    'done',
    'input_empty',
    'output_empty',
    'truncated',
    'stale_input',
    'protocol_error',
    'apply_error',
    'error',
  ])
  if (
    !validStatuses.has(
      record.processingStatus as EvidenceRecordProcessingStatus,
    )
  ) {
    return false
  }
  if (
    record.processingStatus === 'done' ||
    record.processingStatus === 'input_empty'
  ) {
    return record.resolution === undefined
  }
  return (
    record.resolution === undefined || record.resolution === 'waived_by_user'
  )
}
