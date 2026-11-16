import { estimateTokens } from '../../utils/llm/estimateTokens'
import type {
  ContextContentMode,
  ContextPacket,
  ContextPacketKind,
  ContextPacketSeed,
  ContextPriority,
} from '../batch/contextPacker'
import type { ChunkLocator } from '../rag/retrievalTypes'

import {
  type EvidenceRecord,
  mapCoverageFactToEvidenceRecord,
} from './evidenceRecords'

export type CoverageUnit = ChunkLocator

export type CoverageCompleteness = 'enumerated' | 'best_effort' | 'unresolved'

export type CoverageState =
  | 'unsearched'
  | 'partial'
  | 'covered'
  | 'closed_with_exception'
  | 'unresolved'

export type CoverageProcessingStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'input_empty'
  | 'output_empty'
  | 'truncated'
  | 'stale_input'
  | 'protocol_error'
  | 'apply_error'
  | 'error'

export type CoverageUnitRecord =
  | {
      unit: CoverageUnit
      processingStatus: 'done' | 'input_empty'
      evidenceRefs?: string[]
    }
  | {
      unit: CoverageUnit
      processingStatus: Exclude<
        CoverageProcessingStatus,
        'done' | 'input_empty'
      >
      evidenceRefs?: string[]
      resolution?: 'waived_by_user'
    }

export type RequirementCoverage = {
  requirementId: string
  requiredScope: 'targeted' | 'whole'
  requiredUnits: CoverageUnit[]
  candidateUnits: CoverageUnit[]
  plannedUnits: CoverageUnit[]
  inspectedUnits: CoverageUnit[]
  evidenceRefs: string[]
  completeness: CoverageCompleteness
  state: CoverageState
}

export type CoverageLedger = {
  schemaVersion: 1
  coverage: RequirementCoverage
  records: CoverageUnitRecord[]
  /** Terminal evidence facts; pending/running remain in CoverageUnitRecord. */
  evidenceRecords?: EvidenceRecord[]
}

export type LegacyWorkflowCoverageEntry = {
  path: string
  articleId: string
  startLine: number
  endLine: number
  status: 'pending' | 'reviewed'
  unitId?: string
  revisionHash?: string
}

/**
 * Materialize one serializable context packet per planned CoverageUnit.
 *
 * The render callback is intentionally outside the resulting packet contract:
 * it is used only while constructing inline content. The returned seeds hold
 * no function, so an execution plan can persist them and defer individual
 * units to a later call.
 */
export function coverageUnitPacketSeeds(input: {
  coverage: RequirementCoverage
  contentByUnitId: Readonly<Record<string, string>>
  kind?: Extract<ContextPacketKind, 'chunk' | 'digest'>
  priority?: ContextPriority
  mustKeep?: boolean
  contentMode?: ContextContentMode
}): ContextPacketSeed[] {
  const kind = input.kind ?? 'chunk'
  const priority = input.priority ?? 'mandatory'
  const mustKeep = input.mustKeep ?? true
  const contentMode = input.contentMode ?? 'full'
  return input.coverage.plannedUnits.map((unit) => {
    const content = input.contentByUnitId[unit.unitId]
    if (content === undefined) {
      throw new Error(`missing content for coverage unit: ${unit.unitId}`)
    }
    const metadata = content.split(/\r?\n/, 1)[0]?.trim() ?? ''
    const countOnly = `[${unit.unitId}: content omitted]`
    return {
      id: `coverage:${input.coverage.requirementId}:${unit.unitId}`,
      kind,
      requirementIds: [input.coverage.requirementId],
      contentMode,
      tokenEstimateByMode: {
        full: estimateTokens(content),
        snippet: estimateTokens(content.slice(0, 1_200)),
        metadata: estimateTokens(metadata),
        count_only: estimateTokens(countOnly),
      },
      coverageUnitIds: [unit.unitId],
      contentRef: { kind: 'inline', text: content },
      routing: { priority, mustKeep },
    }
  })
}

export function makeCoverageUnitId(
  path: string,
  revisionHash: string,
  startLine: number,
  endLine: number,
): string {
  return `${path}@${revisionHash}:${startLine}-${endLine}`
}

function validateUnit(unit: CoverageUnit): void {
  if (
    !unit.unitId.trim() ||
    !unit.path.trim() ||
    !unit.revisionHash.trim() ||
    !Number.isInteger(unit.startLine) ||
    !Number.isInteger(unit.endLine) ||
    unit.startLine < 1 ||
    unit.endLine < unit.startLine
  ) {
    throw new Error(`invalid coverage unit: ${unit.unitId || unit.path}`)
  }
}

export function dedupeCoverageUnits(
  units: readonly CoverageUnit[],
): CoverageUnit[] {
  const seen = new Set<string>()
  const result: CoverageUnit[] = []
  for (const unit of units) {
    validateUnit(unit)
    if (seen.has(unit.unitId)) continue
    seen.add(unit.unitId)
    result.push({
      ...unit,
      ...(unit.headingPath ? { headingPath: [...unit.headingPath] } : {}),
    })
  }
  return result
}

export function coverageUnitFromWorkflowEntry(
  entry: LegacyWorkflowCoverageEntry,
): CoverageUnit {
  if (!entry.revisionHash) {
    throw new Error(
      `workflow coverage entry has no revisionHash: ${entry.path}:${entry.startLine}-${entry.endLine}`,
    )
  }
  return {
    unitId:
      entry.unitId ??
      makeCoverageUnitId(
        entry.path,
        entry.revisionHash,
        entry.startLine,
        entry.endLine,
      ),
    path: entry.path,
    startLine: entry.startLine,
    endLine: entry.endLine,
    revisionHash: entry.revisionHash,
  }
}

export function createRequirementCoverage(input: {
  requirementId: string
  requiredScope: 'targeted' | 'whole'
  requiredUnits?: readonly CoverageUnit[]
  candidateUnits?: readonly CoverageUnit[]
  plannedUnits?: readonly CoverageUnit[]
  inspectedUnits?: readonly CoverageUnit[]
  evidenceRefs?: readonly string[]
  completeness?: CoverageCompleteness
}): RequirementCoverage {
  const requiredUnits = dedupeCoverageUnits(input.requiredUnits ?? [])
  const candidateUnits = dedupeCoverageUnits(input.candidateUnits ?? [])
  const plannedUnits = dedupeCoverageUnits(
    input.plannedUnits ??
      (input.requiredScope === 'whole' ? requiredUnits : []),
  )
  const inspectedUnits = dedupeCoverageUnits(input.inspectedUnits ?? [])
  return {
    requirementId: input.requirementId,
    requiredScope: input.requiredScope,
    requiredUnits,
    candidateUnits,
    plannedUnits,
    inspectedUnits,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])],
    completeness:
      input.completeness ??
      (input.requiredScope === 'whole' ? 'enumerated' : 'best_effort'),
    state: 'unsearched',
  }
}

export function isCoverageSatisfiedStatus(
  status: CoverageProcessingStatus,
): status is 'done' | 'input_empty' {
  return status === 'done' || status === 'input_empty'
}

export function isCoverageResolvedRecord(record: CoverageUnitRecord): boolean {
  return (
    isCoverageSatisfiedStatus(record.processingStatus) ||
    ('resolution' in record && record.resolution === 'waived_by_user')
  )
}

export function isCoverageSatisfiedRecord(record: CoverageUnitRecord): boolean {
  return isCoverageSatisfiedStatus(record.processingStatus)
}

export function deriveCoverageState(
  coverage: RequirementCoverage,
  records: readonly CoverageUnitRecord[],
): CoverageState {
  if (coverage.plannedUnits.length === 0) return 'unsearched'
  const recordsByUnitId = new Map(
    records.map((record) => [record.unit.unitId, record]),
  )
  const plannedRecords = coverage.plannedUnits.map((unit) =>
    recordsByUnitId.get(unit.unitId),
  )
  if (
    plannedRecords.every(
      (record) => record && isCoverageSatisfiedRecord(record),
    )
  ) {
    return 'covered'
  }
  if (
    plannedRecords.every(
      (record) => record && isCoverageResolvedRecord(record),
    ) &&
    plannedRecords.some(
      (record) =>
        record &&
        'resolution' in record &&
        record.resolution === 'waived_by_user',
    )
  ) {
    return 'closed_with_exception'
  }
  const inspected = plannedRecords.filter(
    (record): record is CoverageUnitRecord => {
      if (!record) return false
      return !['pending', 'running'].includes(record.processingStatus)
    },
  )
  if (inspected.length === 0) return 'unsearched'
  if (
    plannedRecords.some((record) => {
      if (!record) return false
      return (
        !isCoverageResolvedRecord(record) &&
        !['pending', 'running'].includes(record.processingStatus)
      )
    })
  ) {
    return 'unresolved'
  }
  return 'partial'
}

export function withDerivedCoverageState(
  coverage: RequirementCoverage,
  records: readonly CoverageUnitRecord[],
): RequirementCoverage {
  return {
    ...coverage,
    requiredUnits: dedupeCoverageUnits(coverage.requiredUnits),
    candidateUnits: dedupeCoverageUnits(coverage.candidateUnits),
    plannedUnits: dedupeCoverageUnits(coverage.plannedUnits),
    inspectedUnits: dedupeCoverageUnits(coverage.inspectedUnits),
    evidenceRefs: [...new Set(coverage.evidenceRefs)],
    state: deriveCoverageState(coverage, records),
  }
}

export type ExecutionCoverageOutcome = 'completed' | 'failed' | 'paused'

/**
 * Attribute one execution-plan result to the coverage units that were
 * actually rendered in the request.
 *
 * This helper deliberately consumes only harness facts: packet inclusion,
 * the executor's terminal outcome, and whether the returned text is empty.
 * It never inspects or parses model prose. Deferred, dropped, and unrelated
 * packets therefore remain outside the incoming records and cannot be
 * mistaken for covered units.
 */
export function attributeExecutionCoverage(input: {
  coverage: RequirementCoverage
  packets: readonly Pick<ContextPacket, 'id' | 'coverageUnitIds'>[]
  includedPacketIds: readonly string[]
  outcome: ExecutionCoverageOutcome
  outputEmpty?: boolean
  outputRef?: string
}): CoverageLedger | null {
  if (input.outcome === 'paused') return null

  const plannedUnitsById = new Map(
    input.coverage.plannedUnits.map((unit) => [unit.unitId, unit]),
  )
  const includedPacketIds = new Set(input.includedPacketIds)
  const includedUnitIds = uniqueStrings(
    input.packets
      .filter((packet) => includedPacketIds.has(packet.id))
      .flatMap((packet) => packet.coverageUnitIds ?? [])
      .filter((unitId) => plannedUnitsById.has(unitId)),
  )
  if (includedUnitIds.length === 0) return null

  const processingStatus: CoverageProcessingStatus =
    input.outcome === 'completed'
      ? input.outputEmpty === true
        ? 'output_empty'
        : 'done'
      : 'error'
  const records: CoverageUnitRecord[] = includedUnitIds.map((unitId) => {
    const unit = plannedUnitsById.get(unitId)
    if (!unit) throw new Error(`missing planned coverage unit: ${unitId}`)
    return {
      unit,
      processingStatus,
    }
  })
  const evidenceRecords = records.flatMap((record) => {
    const evidence = mapCoverageFactToEvidenceRecord({
      ...record.unit,
      processingStatus,
      ...(input.outputRef ? { outputRef: input.outputRef } : {}),
    })
    return evidence ? [evidence] : []
  })
  const coverage = withDerivedCoverageState(input.coverage, records)
  return {
    schemaVersion: 1,
    coverage,
    records,
    ...(evidenceRecords.length > 0 ? { evidenceRecords } : {}),
  }
}

/**
 * Merge a later executor result into an existing requirement ledger.
 *
 * Unit identity is the only join key. The base ledger owns the planned
 * denominator and unit definitions; an incoming result can update facts for
 * matching units but cannot introduce a new unit or change a revision-bound
 * locator. This keeps multi-unit batch results safe to project into workflow
 * ledgers.
 */
export function mergeCoverageLedgers(
  base: CoverageLedger,
  incoming: CoverageLedger,
): CoverageLedger {
  const incomingRecords = new Map(
    incoming.records.map((record) => [record.unit.unitId, record]),
  )
  const baseRecords = new Map(
    base.records.map((record) => [record.unit.unitId, record]),
  )
  const records = base.coverage.plannedUnits.map(
    (unit): CoverageUnitRecord =>
      incomingRecords.get(unit.unitId) ??
      baseRecords.get(unit.unitId) ?? {
        unit,
        processingStatus: 'pending',
      },
  )

  const plannedUnitIds = new Set(
    base.coverage.plannedUnits.map((unit) => unit.unitId),
  )
  const evidenceByUnitId = new Map(
    (base.evidenceRecords ?? []).map((record) => [record.unitId, record]),
  )
  for (const record of incoming.evidenceRecords ?? []) {
    if (plannedUnitIds.has(record.unitId)) {
      evidenceByUnitId.set(record.unitId, record)
    }
  }

  const coverage = withDerivedCoverageState(
    {
      ...base.coverage,
      evidenceRefs: [
        ...new Set([
          ...base.coverage.evidenceRefs,
          ...incoming.coverage.evidenceRefs,
        ]),
      ],
    },
    records,
  )
  return {
    ...base,
    coverage,
    records,
    ...(evidenceByUnitId.size > 0
      ? { evidenceRecords: [...evidenceByUnitId.values()] }
      : {}),
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}
