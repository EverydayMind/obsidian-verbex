import { estimateTokens } from '../../utils/llm/estimateTokens'
import type { ChunkLocator } from '../rag/retrievalTypes'
import type { RequirementCoverage } from '../routing/coverage'
import {
  type CoverageDecision,
  type RequestCoverage,
  type RequestOperation,
  decideRequestScope,
} from '../routing/scopeDecision'

import type { BatchContract } from './contracts'

export type RendererKind = 'chunk_range' | 'heading_section'
export type ContextPacketKind =
  | 'chunk'
  | 'digest'
  | 'inventory'
  | 'history'
  | 'instruction'
export type ContextPriority = 'mandatory' | 'supporting' | 'optional'
export type ContextContentMode = 'full' | 'snippet' | 'metadata' | 'count_only'
export type ContextDisposition = 'included' | 'available' | 'dropped'
export type ContextFallback =
  | 'fit_to_budget'
  | 'split_by_coverage_unit'
  | 'demote_content_mode'
  | 'defer_to_next_call'

export type ContentRef =
  | { kind: 'inline'; text: string }
  | { kind: 'lazy'; locator: ChunkLocator; rendererKind: RendererKind }
  | { kind: 'manifest'; ref: string }

export type ContextPacket = {
  id: string
  kind: ContextPacketKind
  requirementIds: string[]
  priority: ContextPriority
  mustKeep: boolean
  tokenEstimateByMode: Partial<Record<ContextContentMode, number>>
  renderedTokens?: number
  contentMode: ContextContentMode
  disposition: ContextDisposition
  fallback?: ContextFallback
  /** CoverageUnit ids represented by this packet, when it is unit-scoped. */
  coverageUnitIds?: string[]
  provenance?: ChunkLocator[]
  contentRef: ContentRef
}

/**
 * Packet input accepted by the router. Priority and mustKeep are explicit
 * facts supplied by the caller; no LLM prose is consulted to derive them.
 */
export type ContextPacketSeed = Omit<
  ContextPacket,
  'priority' | 'mustKeep' | 'disposition' | 'renderedTokens'
> & {
  routing: {
    priority: ContextPriority
    mustKeep: boolean
  }
}

export type PacketRenderer = (
  locator: ChunkLocator,
  mode: ContextContentMode,
) => string | Promise<string>

export type RendererRegistry = Partial<Record<RendererKind, PacketRenderer>>

export type PackedContextBlock = {
  packetId: string
  mode: ContextContentMode
  text: string
  renderedTokens: number
}

export type CapacityError = {
  kind: 'invalid_budget' | 'fixed_overhead' | 'mandatory_overflow'
  message: string
  estimatedTokens: number
  budgetTokens: number
  packetId?: string
}

export type ContextPackerResult = {
  status: 'ready' | 'capacity_error'
  text: string
  blocks: PackedContextBlock[]
  packets: ContextPacket[]
  includedPacketIds: string[]
  deferredPacketIds: string[]
  deferredCoverageUnitIds: string[]
  droppedPacketIds: string[]
  estimatedTokens: number
  renderedTokens: number
  budgetTokens: number
  fixedOverheadTokens: number
  capacityError?: CapacityError
  diagnostics: string[]
}

/** Durable continuation state persisted by the run-state layer. */
export type ContextPackerDeferState = {
  version: 1
  packetIds: string[]
  coverageUnitIds: string[]
}

export type ContextPackerOptions = {
  inputBudgetTokens: number
  fixedOverheadTokens: number
  rendererRegistry?: RendererRegistry
  durableDeferPacketIds?: ReadonlySet<string> | readonly string[]
  durableDeferCoverageUnitIds?: ReadonlySet<string> | readonly string[]
  maxInventoryPackets?: number
  maxInventoryTokens?: number
  maxMetadataTokens?: number
  renderWrapper?: (packet: ContextPacket, body: string) => string
}

export type OutputMode = 'answer' | 'transform' | 'synthesis'
export type ExecutionMode = 'interactive' | 'batch'
export type ExecutionExecutor =
  | 'interactive'
  | 'unit_batch'
  | 'map_reduce'
  | 'capacity_error'

export type ExecutionPlan = {
  version: 1
  scope: RequestCoverage
  outputMode: OutputMode
  execution: ExecutionMode
  executor: ExecutionExecutor
  decision: CoverageDecision
  coverage?: RequirementCoverage
  inputBudgetTokens: number
  fixedOverheadTokens: number
  packets: ContextPacket[]
  packed: ContextPackerResult
}

/**
 * Body-less execution-plan trace suitable for run artifacts. Packet content
 * stays in the current request; the trace only records routing and allocation
 * facts needed to explain or resume the next call.
 */
export type ExecutionPlanSnapshot = {
  version: 1
  scope: RequestCoverage
  outputMode: OutputMode
  execution: ExecutionMode
  executor: ExecutionExecutor
  decision: CoverageDecision
  coverage?: {
    requirementId: string
    plannedUnitIds: string[]
    state: RequirementCoverage['state']
  }
  inputBudgetTokens: number
  fixedOverheadTokens: number
  packetIds: string[]
  refittedPackets?: {
    id: string
    disposition: ContextDisposition
    contentMode: ContextContentMode
    renderedTokens?: number
    fallback?: ContextFallback
  }[]
  includedPacketIds: string[]
  deferredPacketIds: string[]
  deferredCoverageUnitIds: string[]
  droppedPacketIds: string[]
  status: ContextPackerResult['status']
  diagnostics: string[]
  capacityError?: CapacityError
}

export type CreateExecutionPlanInput = {
  request: string
  contract?: BatchContract | null
  decision?: CoverageDecision
  coverage?: RequirementCoverage
  outputMode?: OutputMode
  execution?: ExecutionMode
  inputBudgetTokens: number
  fixedOverheadTokens?: number
  fixedOverheadTexts?: readonly string[]
  packets: ContextPacketSeed[]
  packer?: Omit<
    ContextPackerOptions,
    'inputBudgetTokens' | 'fixedOverheadTokens'
  >
}

const DEFAULT_MAX_INVENTORY_PACKETS = 50
const DEFAULT_MAX_INVENTORY_TOKENS = 1_024
const DEFAULT_MAX_METADATA_TOKENS = 2_048
const PRIORITY_ORDER: Record<ContextPriority, number> = {
  mandatory: 0,
  supporting: 1,
  optional: 2,
}
const MODE_FALLBACKS: Record<ContextContentMode, ContextContentMode[]> = {
  full: ['full', 'snippet', 'metadata', 'count_only'],
  snippet: ['snippet', 'metadata', 'count_only'],
  metadata: ['metadata', 'count_only'],
  count_only: ['count_only'],
}

function asDurableSet(
  value: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  return value instanceof Set ? value : new Set(value ?? [])
}

function validNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validateLocator(locator: ChunkLocator, label: string): void {
  if (
    !locator.unitId.trim() ||
    !locator.path.trim() ||
    !locator.revisionHash.trim()
  ) {
    throw new Error(`${label} must include unitId, path, and revisionHash`)
  }
  if (
    !Number.isInteger(locator.startLine) ||
    !Number.isInteger(locator.endLine) ||
    locator.startLine < 0 ||
    locator.endLine < locator.startLine
  ) {
    throw new Error(`${label} must contain a valid line range`)
  }
}

function validatePacket(
  packet: ContextPacket,
  renderers: RendererRegistry,
): void {
  if (!packet.id.trim()) throw new Error('context packet id is required')
  if (packet.requirementIds.some((id) => !id.trim())) {
    throw new Error(`context packet ${packet.id} has an empty requirement id`)
  }
  if (packet.coverageUnitIds?.some((id) => !id.trim())) {
    throw new Error(`context packet ${packet.id} has an empty coverage unit id`)
  }
  for (const [mode, estimate] of Object.entries(packet.tokenEstimateByMode)) {
    if (!validNonNegativeNumber(estimate)) {
      throw new Error(
        `context packet ${packet.id} has an invalid ${mode} token estimate`,
      )
    }
  }
  if (packet.kind !== 'chunk' && packet.provenance?.length) {
    throw new Error(
      `context packet ${packet.id} may only attach provenance to chunk content`,
    )
  }
  if (packet.contentRef.kind === 'lazy') {
    if (!renderers[packet.contentRef.rendererKind]) {
      throw new Error(
        `context packet ${packet.id} references an unregistered renderer: ${packet.contentRef.rendererKind}`,
      )
    }
    validateLocator(
      packet.contentRef.locator,
      `${packet.id}.contentRef.locator`,
    )
  }
  for (const [index, locator] of (packet.provenance ?? []).entries()) {
    validateLocator(locator, `${packet.id}.provenance[${index}]`)
  }
}

export function routeContextPackets(
  seeds: readonly ContextPacketSeed[],
): ContextPacket[] {
  const ids = new Set<string>()
  return seeds.map((seed) => {
    if (ids.has(seed.id)) {
      throw new Error(`duplicate context packet id: ${seed.id}`)
    }
    ids.add(seed.id)
    return {
      id: seed.id,
      kind: seed.kind,
      requirementIds: [...seed.requirementIds],
      priority: seed.routing.priority,
      mustKeep: seed.routing.mustKeep,
      tokenEstimateByMode: { ...seed.tokenEstimateByMode },
      contentMode: seed.contentMode,
      disposition: 'available',
      ...(seed.fallback ? { fallback: seed.fallback } : {}),
      ...(seed.coverageUnitIds
        ? { coverageUnitIds: [...seed.coverageUnitIds] }
        : {}),
      ...(seed.provenance ? { provenance: [...seed.provenance] } : {}),
      contentRef: seed.contentRef,
    }
  })
}

export function truncateTextToTokens(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return ''
  if (estimateTokens(text) <= maxTokens) return text
  let low = 0
  let high = text.length
  let best = ''
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = text.slice(0, middle).trimEnd()
    if (estimateTokens(candidate) <= maxTokens) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

export function capInventoryText(
  text: string,
  maxTokens: number,
): { text: string; capped: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, capped: false }
  const marker =
    '\n[folder inventory capped; use the manifest/reference tools for more entries]'
  const bodyBudget = Math.max(0, maxTokens - estimateTokens(marker))
  return {
    text: `${truncateTextToTokens(text, bodyBudget)}${marker}`,
    capped: true,
  }
}

function renderInlineText(
  text: string,
  mode: ContextContentMode,
  packetId: string,
  targetTokens?: number,
): string {
  if (mode === 'full') return text
  if (mode === 'count_only') return `[${packetId}: content omitted]`
  if (mode === 'metadata') {
    return text.split(/\r?\n/, 1)[0]?.trim() || `[${packetId}: metadata]`
  }
  return targetTokens === undefined
    ? text
    : truncateTextToTokens(text, targetTokens)
}

async function renderBody(
  packet: ContextPacket,
  mode: ContextContentMode,
  options: ContextPackerOptions,
): Promise<{ body: string; capped: boolean }> {
  const targetTokens = packet.tokenEstimateByMode[mode]
  let body: string
  if (packet.contentRef.kind === 'inline') {
    body = renderInlineText(
      packet.contentRef.text,
      mode,
      packet.id,
      targetTokens,
    )
  } else if (packet.contentRef.kind === 'manifest') {
    body = `[manifest reference: ${packet.contentRef.ref}]`
  } else {
    const renderer = options.rendererRegistry?.[packet.contentRef.rendererKind]
    if (!renderer) {
      throw new Error(
        `context packet ${packet.id} references an unregistered renderer: ${packet.contentRef.rendererKind}`,
      )
    }
    body = await renderer(packet.contentRef.locator, mode)
  }

  let capped = false
  if (packet.kind === 'inventory') {
    const result = capInventoryText(
      body,
      options.maxInventoryTokens ?? DEFAULT_MAX_INVENTORY_TOKENS,
    )
    body = result.text
    capped = result.capped
  } else if (mode === 'metadata') {
    const maxMetadataTokens =
      options.maxMetadataTokens ?? DEFAULT_MAX_METADATA_TOKENS
    const cappedResult = capInventoryText(body, maxMetadataTokens)
    body = cappedResult.text
    capped = cappedResult.capped
  }
  return { body, capped }
}

export function renderBlock(
  packet: ContextPacket,
  body: string,
  wrapper: (packet: ContextPacket, body: string) => string,
): string {
  return wrapper(packet, body).trim()
}

export function replacePackedBlock(
  packed: ContextPackerResult,
  packetId: string,
  text: string,
  maxTokens: number,
): ContextPackerResult {
  const packet = packed.packets.find((item) => item.id === packetId)
  const renderedTokens = estimateTokens(text)
  if (packed.status !== 'ready' || !packet || renderedTokens > maxTokens)
    return packed
  const updated = {
    ...packet,
    disposition: 'included' as const,
    contentMode: 'full' as const,
    renderedTokens,
    fallback: 'fit_to_budget' as const,
    contentRef: { kind: 'inline' as const, text },
    tokenEstimateByMode: {
      ...packet.tokenEstimateByMode,
      full: renderedTokens,
    },
  }
  const packets = packed.packets.map((item) =>
    item.id === packetId ? updated : item,
  )
  const order = new Map(packets.map((item, index) => [item.id, index]))
  const blocks = [
    ...packed.blocks.filter((block) => block.packetId !== packetId),
    { packetId, mode: 'full' as const, text, renderedTokens },
  ].sort((a, b) => (order.get(a.packetId) ?? 0) - (order.get(b.packetId) ?? 0))
  return {
    ...packed,
    packets,
    blocks,
    text: blocks.map((block) => block.text).join('\n\n'),
    renderedTokens: blocks.reduce(
      (sum, block) => sum + block.renderedTokens,
      0,
    ),
    includedPacketIds: blocks.map((block) => block.packetId),
    droppedPacketIds: packed.droppedPacketIds.filter((id) => id !== packetId),
    diagnostics: [
      ...packed.diagnostics,
      `packet refit to the remaining budget: ${packetId}`,
    ],
  }
}

function readyResult(input: {
  packets: ContextPacket[]
  blocks: PackedContextBlock[]
  budgetTokens: number
  fixedOverheadTokens: number
  estimatedTokens: number
  diagnostics: string[]
  deferredPacketIds: string[]
  deferredCoverageUnitIds: string[]
  droppedPacketIds: string[]
}): ContextPackerResult {
  const originalOrder = new Map(
    input.packets.map((packet, index) => [packet.id, index]),
  )
  const blocks = [...input.blocks].sort(
    (a, b) =>
      (originalOrder.get(a.packetId) ?? Number.MAX_SAFE_INTEGER) -
      (originalOrder.get(b.packetId) ?? Number.MAX_SAFE_INTEGER),
  )
  return {
    status: 'ready',
    text: blocks.map((block) => block.text).join('\n\n'),
    blocks,
    packets: input.packets,
    includedPacketIds: blocks.map((block) => block.packetId),
    deferredPacketIds: input.deferredPacketIds,
    deferredCoverageUnitIds: input.deferredCoverageUnitIds,
    droppedPacketIds: input.droppedPacketIds,
    estimatedTokens: input.estimatedTokens,
    renderedTokens: blocks.reduce(
      (total, block) => total + block.renderedTokens,
      0,
    ),
    budgetTokens: input.budgetTokens,
    fixedOverheadTokens: input.fixedOverheadTokens,
    diagnostics: input.diagnostics,
  }
}

export async function packContextPackets(
  packets: readonly ContextPacket[],
  options: ContextPackerOptions,
): Promise<ContextPackerResult> {
  const inputBudgetTokens = Math.floor(options.inputBudgetTokens)
  const fixedOverheadTokens = Math.floor(options.fixedOverheadTokens)
  const budgetTokens = Math.max(0, inputBudgetTokens - fixedOverheadTokens)
  const rendererRegistry = options.rendererRegistry ?? {}
  const diagnostics: string[] = []
  const working: ContextPacket[] = packets.map((packet) => ({
    ...packet,
    requirementIds: [...packet.requirementIds],
    tokenEstimateByMode: { ...packet.tokenEstimateByMode },
    ...(packet.coverageUnitIds
      ? { coverageUnitIds: [...packet.coverageUnitIds] }
      : {}),
    ...(packet.provenance ? { provenance: [...packet.provenance] } : {}),
    disposition: 'available',
  }))

  try {
    const ids = new Set<string>()
    for (const packet of working) {
      if (ids.has(packet.id))
        throw new Error(`duplicate context packet id: ${packet.id}`)
      ids.add(packet.id)
      validatePacket(packet, rendererRegistry)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 'capacity_error',
      text: '',
      blocks: [],
      packets: working,
      includedPacketIds: [],
      deferredPacketIds: [],
      deferredCoverageUnitIds: [],
      droppedPacketIds: [],
      estimatedTokens: 0,
      renderedTokens: 0,
      budgetTokens,
      fixedOverheadTokens,
      capacityError: {
        kind: 'invalid_budget',
        message,
        estimatedTokens: 0,
        budgetTokens,
      },
      diagnostics,
    }
  }

  if (inputBudgetTokens <= 0 || fixedOverheadTokens < 0) {
    return {
      status: 'capacity_error',
      text: '',
      blocks: [],
      packets: working,
      includedPacketIds: [],
      deferredPacketIds: [],
      deferredCoverageUnitIds: [],
      droppedPacketIds: [],
      estimatedTokens: 0,
      renderedTokens: 0,
      budgetTokens,
      fixedOverheadTokens,
      capacityError: {
        kind: 'invalid_budget',
        message:
          'input and fixed-overhead token budgets must be non-negative, with a positive input budget',
        estimatedTokens: fixedOverheadTokens,
        budgetTokens: inputBudgetTokens,
      },
      diagnostics,
    }
  }
  if (fixedOverheadTokens > inputBudgetTokens) {
    return {
      status: 'capacity_error',
      text: '',
      blocks: [],
      packets: working,
      includedPacketIds: [],
      deferredPacketIds: [],
      deferredCoverageUnitIds: [],
      droppedPacketIds: [],
      estimatedTokens: fixedOverheadTokens,
      renderedTokens: 0,
      budgetTokens,
      fixedOverheadTokens,
      capacityError: {
        kind: 'fixed_overhead',
        message:
          'fixed overhead already exceeds the input budget; splitting or deferring content would repeat the same failure',
        estimatedTokens: fixedOverheadTokens,
        budgetTokens: inputBudgetTokens,
      },
      diagnostics,
    }
  }

  const durableDeferPacketIds = asDurableSet(options.durableDeferPacketIds)
  const durableDeferCoverageUnitIds = asDurableSet(
    options.durableDeferCoverageUnitIds,
  )
  const sorted = working
    .map((packet, index) => ({ packet, index }))
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.packet.priority] - PRIORITY_ORDER[b.packet.priority] ||
        a.index - b.index,
    )
  const maxInventoryPackets = Math.max(
    0,
    Math.floor(options.maxInventoryPackets ?? DEFAULT_MAX_INVENTORY_PACKETS),
  )
  let inventoryCount = 0
  let usedTokens = 0
  let estimatedTokens = 0
  const blocks: PackedContextBlock[] = []
  const deferredPacketIds: string[] = []
  const deferredCoverageUnitIds: string[] = []
  const droppedPacketIds: string[] = []
  const wrapper =
    options.renderWrapper ?? ((packet, body) => `## ${packet.id}\n${body}`)

  for (const { packet } of sorted) {
    if (packet.kind === 'inventory') {
      inventoryCount += 1
      if (inventoryCount > maxInventoryPackets) {
        packet.disposition = 'dropped'
        droppedPacketIds.push(packet.id)
        diagnostics.push(`inventory packet dropped by count cap: ${packet.id}`)
        continue
      }
    }

    const initialMode = packet.contentMode
    const protectedPacket = packet.mustKeep || packet.priority === 'mandatory'
    const modes = protectedPacket
      ? [packet.contentMode]
      : MODE_FALLBACKS[packet.contentMode]
    let selected: PackedContextBlock | undefined
    let selectedMode: ContextContentMode | undefined
    let selectedWasCapped = false
    for (const mode of modes) {
      const rendered = await renderBody(packet, mode, options)
      const text = renderBlock(packet, rendered.body, wrapper)
      const renderedTokens = estimateTokens(text)
      const estimate = packet.tokenEstimateByMode[mode] ?? renderedTokens
      if (usedTokens + renderedTokens <= budgetTokens) {
        selected = { packetId: packet.id, mode, text, renderedTokens }
        selectedMode = mode
        selectedWasCapped = rendered.capped
        estimatedTokens += estimate
        break
      }
    }

    if (!selected || !selectedMode) {
      const maximum = Math.max(
        ...modes.map((mode) => packet.tokenEstimateByMode[mode] ?? 0),
        0,
      )
      if (protectedPacket) {
        const coverageUnitId =
          packet.coverageUnitIds?.length === 1
            ? packet.coverageUnitIds[0]
            : undefined
        const canDeferCoverageUnit =
          coverageUnitId !== undefined &&
          (durableDeferPacketIds.has(packet.id) ||
            durableDeferCoverageUnitIds.has(coverageUnitId))
        if (canDeferCoverageUnit) {
          packet.disposition = 'available'
          packet.fallback = 'split_by_coverage_unit'
          deferredPacketIds.push(packet.id)
          deferredCoverageUnitIds.push(coverageUnitId)
          diagnostics.push(
            `mandatory coverage unit deferred to the explicit next call: ${coverageUnitId}`,
          )
          continue
        }
        return {
          status: 'capacity_error',
          text: '',
          blocks: [],
          packets: working,
          includedPacketIds: [],
          deferredPacketIds,
          deferredCoverageUnitIds,
          droppedPacketIds,
          estimatedTokens: usedTokens + maximum,
          renderedTokens: usedTokens,
          budgetTokens,
          fixedOverheadTokens,
          capacityError: {
            kind: 'mandatory_overflow',
            message: `protected context packet does not fit; CoverageUnit splitting is required before execution: ${packet.id}`,
            estimatedTokens: usedTokens + maximum,
            budgetTokens,
            packetId: packet.id,
          },
          diagnostics,
        }
      }
      const coverageUnitId =
        packet.coverageUnitIds?.length === 1
          ? packet.coverageUnitIds[0]
          : undefined
      if (
        durableDeferPacketIds.has(packet.id) ||
        (coverageUnitId !== undefined &&
          durableDeferCoverageUnitIds.has(coverageUnitId))
      ) {
        packet.disposition = 'available'
        packet.fallback = coverageUnitId
          ? 'split_by_coverage_unit'
          : 'defer_to_next_call'
        deferredPacketIds.push(packet.id)
        if (coverageUnitId) deferredCoverageUnitIds.push(coverageUnitId)
        diagnostics.push(
          `packet deferred to a durable next-call plan: ${packet.id}`,
        )
      } else {
        packet.disposition = 'dropped'
        droppedPacketIds.push(packet.id)
        diagnostics.push(
          `packet dropped after content-mode fallback: ${packet.id}`,
        )
      }
      continue
    }

    packet.disposition = 'included'
    packet.contentMode = selectedMode
    packet.renderedTokens = selected.renderedTokens
    if (selectedMode !== initialMode) {
      packet.fallback = 'demote_content_mode'
    }
    if (selectedWasCapped) {
      diagnostics.push(`packet content capped during rendering: ${packet.id}`)
    }
    usedTokens += selected.renderedTokens
    blocks.push(selected)
  }

  return readyResult({
    packets: working,
    blocks,
    budgetTokens,
    fixedOverheadTokens,
    estimatedTokens,
    diagnostics,
    deferredPacketIds,
    deferredCoverageUnitIds,
    droppedPacketIds,
  })
}

function outputModeForOperation(operation: RequestOperation): OutputMode {
  if (operation === 'transform') return 'transform'
  if (operation === 'analysis') return 'synthesis'
  return 'answer'
}

/**
 * Select the executor from harness facts only. `contract` means the caller
 * supplied an explicit batch contract; a whole request without that contract
 * is prepared through map-reduce, while targeted requests stay interactive.
 */
export function resolveExecutionExecutor(input: {
  decision: CoverageDecision
  contract?: BatchContract | null
  coverage?: RequirementCoverage
  packedStatus?: ContextPackerResult['status']
}): ExecutionExecutor {
  if (input.packedStatus === 'capacity_error') return 'capacity_error'
  if (input.contract) return 'unit_batch'
  if (input.coverage?.requiredScope === 'whole') return 'map_reduce'
  if (input.decision.coverage === 'whole') return 'map_reduce'
  return 'interactive'
}

export async function createExecutionPlan(
  input: CreateExecutionPlanInput,
): Promise<ExecutionPlan> {
  const decision =
    input.decision ??
    decideRequestScope({ request: input.request, contract: input.contract })
  const fixedOverheadTokens =
    input.fixedOverheadTokens ??
    estimateTokens((input.fixedOverheadTexts ?? []).join('\n\n'))
  const packets = routeContextPackets(input.packets)
  const packed = await packContextPackets(packets, {
    ...input.packer,
    inputBudgetTokens: input.inputBudgetTokens,
    fixedOverheadTokens,
  })
  const execution =
    input.execution ?? (decision.coverage === 'whole' ? 'batch' : 'interactive')
  return {
    version: 1,
    scope: decision.coverage,
    outputMode: input.outputMode ?? outputModeForOperation(decision.operation),
    execution,
    executor: resolveExecutionExecutor({
      decision,
      contract: input.contract,
      coverage: input.coverage,
      packedStatus: packed.status,
    }),
    decision,
    ...(input.coverage ? { coverage: input.coverage } : {}),
    inputBudgetTokens: input.inputBudgetTokens,
    fixedOverheadTokens,
    packets: packed.packets,
    packed,
  }
}

export function snapshotExecutionPlan(
  plan: ExecutionPlan,
): ExecutionPlanSnapshot {
  return {
    version: 1,
    scope: plan.scope,
    outputMode: plan.outputMode,
    execution: plan.execution,
    executor: plan.executor,
    decision: { ...plan.decision },
    ...(plan.coverage
      ? {
          coverage: {
            requirementId: plan.coverage.requirementId,
            plannedUnitIds: plan.coverage.plannedUnits.map(
              (unit) => unit.unitId,
            ),
            state: plan.coverage.state,
          },
        }
      : {}),
    inputBudgetTokens: plan.inputBudgetTokens,
    fixedOverheadTokens: plan.fixedOverheadTokens,
    packetIds: plan.packets.map((packet) => packet.id),
    ...(plan.packets.some((packet) => packet.fallback === 'fit_to_budget')
      ? {
          refittedPackets: plan.packets
            .filter((packet) => packet.fallback === 'fit_to_budget')
            .map(
              ({ id, disposition, contentMode, renderedTokens, fallback }) => ({
                id,
                disposition,
                contentMode,
                renderedTokens,
                fallback,
              }),
            ),
        }
      : {}),
    includedPacketIds: [...plan.packed.includedPacketIds],
    deferredPacketIds: [...plan.packed.deferredPacketIds],
    deferredCoverageUnitIds: [...plan.packed.deferredCoverageUnitIds],
    droppedPacketIds: [...plan.packed.droppedPacketIds],
    status: plan.packed.status,
    diagnostics: [...plan.packed.diagnostics],
    ...(plan.packed.capacityError
      ? { capacityError: { ...plan.packed.capacityError } }
      : {}),
  }
}
