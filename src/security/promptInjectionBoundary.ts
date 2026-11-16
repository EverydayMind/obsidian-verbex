import type { RequestMessage } from '../types/llm/request'
import { sha256Hex } from '../utils/hash'
import type { ProposedChange, SourceDependency } from '../verbex/types'

import { connectorDisclosureSegments } from './connectorDisclosure'
import { normalizeMessageText } from './wellFormedText'

/** Effects are deliberately multi-axis: a read can also be provider egress. */
export type CanonicalOp =
  | 'create'
  | 'modify'
  | 'delete'
  | 'rename'
  | 'move'
  | 'external_call'
  | 'provider_disclosure'

export type Effect =
  | 'vaultRead'
  | 'vaultWrite'
  | 'networkEgress'
  | 'externalMutation'
  | 'destructive'
  | 'policyWrite'
  | 'persistentMemoryWrite'
  | 'costBearing'

export type ExecutionPhase = 'propose' | 'external_call' | 'apply'
export type DisclosureLevel =
  | 'host_internal'
  | 'metadata'
  | 'snippet'
  | 'content'

export type Budget = {
  maxCalls: number
  maxFiles: number
  maxBytes: number
  maxCost: number
}

export type ScopeGrant = {
  id: string
  runId: string
  turnId: string
  expiresAt: number
  allowedEffects: readonly Effect[]
  allowedOps: readonly CanonicalOp[]
  pathRoots: readonly string[]
  budget: Budget
  used: Budget
  /** Optional workflow contract pin; never inferred from model output. */
  contractManifestHash?: string
  providerIdentity?: {
    serverConfigHash: string
    connectionGeneration: number
    toolSchemaHash: string
  }
  allowedDestinations?: readonly string[]
}

export type ReadGrant = {
  id: string
  runId: string
  turnId: string
  providerConfigHash: string
  connectionGeneration: number
  expiresAt: number
  pathRoots: readonly string[]
  allowedLevels: readonly DisclosureLevel[]
  budget: Budget
  used: Budget
}

export type EffectDescriptorBase = {
  effects: readonly Effect[]
  measuredBytes: number
  costUpperBound: number
  canonicalArguments: unknown
  effectFingerprint: string
}

export type DisclosureSegment = {
  level: DisclosureLevel
  /** Audit-only provenance; never used for authorization. */
  origins: readonly string[]
  /** Host-normalized vault paths used for pathRoots/maxFiles checks. */
  canonicalVaultPaths: readonly string[]
  measuredBytes: number
  unattributedFiles?: number
  content: string
}

export type AggregatedDisclosureDescriptor = {
  kind: 'provider_disclosure'
  effects: readonly ['networkEgress']
  measuredBytes: number
  totalMeasuredBytes: number
  wirePayloadBytes: number
  costUpperBound: number
  providerConfigHash: string
  connectionGeneration: number
  turnId: string
  segments: readonly DisclosureSegment[]
  wirePayloadDigest: string
  canonicalArguments: unknown
  effectFingerprint: string
}

type ApplyDescriptorBase = EffectDescriptorBase & {
  kind: 'apply'
  op: CanonicalOp & ('create' | 'modify' | 'delete' | 'rename' | 'move')
  path: string
  /** Complete predicted file set for a composite write. */
  compositePaths?: readonly string[]
  before: string | null
  after: string | null
  preconditionHash: string
  batch:
    | 'none'
    | { id: string; order: number; canonicalPathSet: readonly string[] }
  /** Present whenever a proposal captured one or more source dependencies. */
  sourceDependenciesFingerprint?: string
  binarySourceDependenciesFingerprint?: string
  approvalMode?: 'whole_change'
}

export type CreateDescriptor = ApplyDescriptorBase & { op: 'create' }
export type ModifyDescriptor = ApplyDescriptorBase & { op: 'modify' }
export type DeleteDescriptor = ApplyDescriptorBase & { op: 'delete' }
export type RelocateDescriptor = ApplyDescriptorBase & {
  op: 'rename' | 'move'
  sourcePath: string
  destinationPath: string
}
export type ApplyDescriptor =
  | CreateDescriptor
  | ModifyDescriptor
  | DeleteDescriptor
  | RelocateDescriptor

export type ExternalCallDescriptor = EffectDescriptorBase & {
  kind: 'external_call'
  op: 'external_call'
  tool: string
  destination: string
  serverConfigHash: string
  connectionGeneration: number
  toolSchemaHash: string
}

export type ExecutionDescriptor = ExternalCallDescriptor | ApplyDescriptor

export type AuthorizedExecution =
  | {
      phase: 'external_call'
      capabilityId: string
      runId: string
      turnId: string
      effectFingerprint: string
      descriptor: ExternalCallDescriptor
    }
  | {
      phase: 'apply'
      capabilityId: string
      runId: string
      turnId: string
      effectFingerprint: string
      preconditionHash: string
      descriptor: ApplyDescriptor
    }

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/** The brand is a type-level marker; object identity is checked separately. */
const authorizedProviderRequestBrand: unique symbol = Symbol(
  'AuthorizedProviderRequest',
)
const issuedProviderRequests = new WeakSet()
export type AuthorizedProviderRequest = {
  readonly [authorizedProviderRequestBrand]: true
  readonly capabilityId: string
  readonly runId: string
  readonly turnId: string
  readonly providerConfigHash: string
  readonly connectionGeneration: number
  readonly wirePayloadDigest: string
  readonly finalWireMessages: DeepReadonly<readonly RequestMessage[]>
}

export type DisclosureContext = {
  runId?: string
  turnId?: string
  providerConfigHash?: string
  connectionGeneration?: number
  /** Host-only path metadata; origins are never authorization input. */
  segments?: readonly DisclosureSegment[]
  approvedConnectorVaultRead?: boolean
}

const DEFAULT_PROVIDER = 'unbound-provider'
const DEFAULT_GENERATION = 0
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_FILES = 200
const DEFAULT_MAX_CALLS = 64
const defaultReadGrants = new Map<string, ReadGrant>()

function cloneAndFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object')
    return value as DeepReadonly<T>
  if (Object.isFrozen(value)) return value as DeepReadonly<T>
  if (Array.isArray(value)) {
    value.forEach((entry: unknown) => {
      void cloneAndFreeze<unknown>(entry)
    })
  } else {
    Object.values(value as Record<string, unknown>).forEach(
      (entry: unknown) => {
        void cloneAndFreeze<unknown>(entry)
      },
    )
  }
  const frozen = Object.freeze(value) as T
  return frozen as DeepReadonly<T>
}

/** Reject duplicate object keys before canonicalization (RFC 8785 I-JSON input). */
function assertNoDuplicateKeys(value: unknown, seen = new WeakSet()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value))
    throw new Error('Cyclic JSON value is not canonicalizable.')
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoDuplicateKeys(entry, seen))
  } else {
    const keys = Object.keys(value)
    if (new Set(keys).size !== keys.length)
      throw new Error(
        'Duplicate JSON object key rejected before canonicalization.',
      )
    keys.forEach((key) =>
      assertNoDuplicateKeys((value as Record<string, unknown>)[key], seen),
    )
  }
  seen.delete(value)
}

export function canonicalize(value: unknown): string {
  assertNoDuplicateKeys(value)
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Non-finite number is not I-JSON.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`
  }
  throw new Error('Unsupported value in canonical JSON.')
}

export async function canonicalDigest(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value))
}

/** Parses JSON while retaining the RFC 8785 duplicate-key rejection rule. */
export async function canonicalDigestJson(json: string): Promise<string> {
  const parser = new JsonDuplicateKeyParser(json)
  const value = parser.parse()
  return canonicalDigest(value)
}

class JsonDuplicateKeyParser {
  private index = 0
  constructor(private readonly source: string) {}

  parse(): unknown {
    const value = this.value()
    this.whitespace()
    if (this.index !== this.source.length)
      throw new Error('Trailing JSON input rejected.')
    return value
  }

  private whitespace(): void {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1
  }

  private value(): unknown {
    this.whitespace()
    const char = this.source[this.index]
    if (char === '{') return this.object()
    if (char === '[') return this.array()
    if (char === '"') return this.string()
    if (this.source.startsWith('true', this.index)) {
      this.index += 4
      return true
    }
    if (this.source.startsWith('false', this.index)) {
      this.index += 5
      return false
    }
    if (this.source.startsWith('null', this.index)) {
      this.index += 4
      return null
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.index),
    )
    if (number) {
      this.index += number[0].length
      const parsed = Number(number[0])
      if (!Number.isFinite(parsed))
        throw new Error('Non-finite JSON number rejected.')
      return parsed
    }
    throw new Error('Malformed JSON input rejected.')
  }

  private string(): string {
    const start = this.index
    this.index += 1
    let escaped = false
    while (this.index < this.source.length) {
      const char = this.source[this.index++]
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        return JSON.parse(this.source.slice(start, this.index)) as string
      }
    }
    throw new Error('Unterminated JSON string rejected.')
  }

  private object(): Record<string, unknown> {
    this.index += 1
    const result = Object.create(null) as Record<string, unknown>
    const keys = new Set<string>()
    this.whitespace()
    if (this.source[this.index] === '}') {
      this.index += 1
      return result
    }
    while (this.index < this.source.length) {
      this.whitespace()
      if (this.source[this.index] !== '"')
        throw new Error('JSON object key expected.')
      const key = this.string()
      if (keys.has(key))
        throw new Error(`Duplicate JSON object key rejected: ${key}`)
      keys.add(key)
      this.whitespace()
      if (this.source[this.index++] !== ':')
        throw new Error('JSON object colon expected.')
      result[key] = this.value()
      this.whitespace()
      const delimiter = this.source[this.index++]
      if (delimiter === '}') return result
      if (delimiter !== ',') throw new Error('JSON object delimiter expected.')
    }
    throw new Error('Unterminated JSON object rejected.')
  }

  private array(): unknown[] {
    this.index += 1
    const result: unknown[] = []
    this.whitespace()
    if (this.source[this.index] === ']') {
      this.index += 1
      return result
    }
    while (this.index < this.source.length) {
      result.push(this.value())
      this.whitespace()
      const delimiter = this.source[this.index++]
      if (delimiter === ']') return result
      if (delimiter !== ',') throw new Error('JSON array delimiter expected.')
    }
    throw new Error('Unterminated JSON array rejected.')
  }
}

function addBudget(a: Budget, b: Budget): Budget {
  return {
    maxCalls: a.maxCalls + b.maxCalls,
    maxFiles: a.maxFiles + b.maxFiles,
    maxBytes: a.maxBytes + b.maxBytes,
    maxCost: a.maxCost + b.maxCost,
  }
}

function assertValidUsedBudget(budget: Budget): void {
  if (
    ![budget.maxCalls, budget.maxFiles, budget.maxBytes].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    !Number.isFinite(budget.maxCost) ||
    budget.maxCost < 0
  )
    throw new Error('Invalid capability budget reservation or usage.')
}

function withinBudget(used: Budget, limit: Budget): boolean {
  return (
    used.maxCalls <= limit.maxCalls &&
    used.maxFiles <= limit.maxFiles &&
    used.maxBytes <= limit.maxBytes &&
    used.maxCost <= limit.maxCost
  )
}

function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length === 0)
        throw new Error(`Path escapes vault root: ${path}`)
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

function isWithinRoot(path: string, root: string): boolean {
  return root === '' || path === root || path.startsWith(`${root}/`)
}

function descriptorBudget(
  descriptor: ExecutionDescriptor | AggregatedDisclosureDescriptor,
): Budget {
  const paths =
    'segments' in descriptor
      ? new Set(
          descriptor.segments.flatMap((segment) => segment.canonicalVaultPaths),
        )
      : new Set(
          descriptor.kind === 'apply'
            ? [
                descriptor.path,
                ...('sourcePath' in descriptor ? [descriptor.sourcePath] : []),
                ...(descriptor.compositePaths ?? []),
              ].map(normalizePath)
            : [],
        )
  return {
    maxCalls: 1,
    maxFiles: paths.size,
    maxBytes: descriptor.measuredBytes,
    maxCost: descriptor.costUpperBound,
  }
}

function validateGrantDescriptorPair(
  grant: ScopeGrant | ReadGrant,
  descriptor: ExecutionDescriptor | AggregatedDisclosureDescriptor,
): void {
  if (descriptor.kind === 'provider_disclosure') {
    if (!('providerConfigHash' in grant))
      throw new Error('Disclosure requires a ReadGrant.')
    if (
      grant.providerConfigHash !== descriptor.providerConfigHash ||
      grant.connectionGeneration !== descriptor.connectionGeneration
    )
      throw new Error('Disclosure provider identity mismatch.')
    if (!grant.allowedLevels.length)
      throw new Error('Disclosure ReadGrant has no allowed levels.')
    return
  }
  if ('providerConfigHash' in grant)
    throw new Error('Execution requires a ScopeGrant.')
  if (
    !descriptor.effects.every((effect) => grant.allowedEffects.includes(effect))
  )
    throw new Error('Effect is outside the ScopeGrant.')
  if (!grant.allowedOps.includes(descriptor.op))
    throw new Error(`Operation ${descriptor.op} is outside the ScopeGrant.`)
  if (
    descriptor.effects.includes('costBearing') &&
    (!Number.isFinite(grant.budget.maxCost) ||
      !Number.isFinite(descriptor.costUpperBound))
  )
    throw new Error(
      'Cost-bearing execution requires finite maxCost and costUpperBound.',
    )
  if (descriptor.kind === 'external_call') {
    if (descriptor.kind !== 'external_call' || !descriptor.destination)
      throw new Error('Network egress requires a destination constraint.')
    const providerIdentity = grant.providerIdentity
    if (!providerIdentity)
      throw new Error('External call requires a bound server identity.')
    if (
      providerIdentity.serverConfigHash !== descriptor.serverConfigHash ||
      providerIdentity.connectionGeneration !==
        descriptor.connectionGeneration ||
      providerIdentity.toolSchemaHash !== descriptor.toolSchemaHash
    )
      throw new Error('External server identity mismatch.')
    if (
      grant.allowedDestinations &&
      !grant.allowedDestinations.includes(descriptor.destination)
    )
      throw new Error('External destination is outside the ScopeGrant.')
  }
  if (descriptor.kind === 'apply') {
    const paths =
      descriptor.op === 'rename' || descriptor.op === 'move'
        ? [descriptor.destinationPath, descriptor.sourcePath]
        : [descriptor.path]
    paths.push(...(descriptor.compositePaths ?? []))
    const roots = grant.pathRoots.map(normalizePath)
    if (
      roots.length &&
      paths.some(
        (path) =>
          !roots.some((root) => isWithinRoot(normalizePath(path), root)),
      )
    )
      throw new Error('Apply path is outside the ScopeGrant roots.')
  }
}

type BrokerRecord = {
  grantId: string
  grant: ScopeGrant | ReadGrant
  runId: string
  turnId: string
  phase: 'external_call' | 'apply' | 'provider_disclosure'
  status: 'issued' | 'reserved' | 'consumed' | 'failed'
  expiresAt: number
  reservedBudget: Budget
  descriptor: ExecutionDescriptor | AggregatedDisclosureDescriptor
}

function returnReservedBudget(record: BrokerRecord): void {
  const used = record.grant.used
  const reserved = record.reservedBudget
  record.grant.used = {
    maxCalls: Math.max(0, used.maxCalls - reserved.maxCalls),
    maxFiles: Math.max(0, used.maxFiles - reserved.maxFiles),
    maxBytes: Math.max(0, used.maxBytes - reserved.maxBytes),
    maxCost: Math.max(0, used.maxCost - reserved.maxCost),
  }
}

/** Stateful in-memory capability broker. No await occurs in the critical section. */
export class CapabilityBroker {
  private readonly records = new Map<string, BrokerRecord>()
  private readonly executions = new WeakMap<object, BrokerRecord>()
  private sequence = 0

  async issueExecutionPermit(
    grant: ScopeGrant,
    descriptor: ExecutionDescriptor,
    ctx: { runId: string; turnId: string },
  ): Promise<AuthorizedExecution> {
    // A permit must not share mutable arguments or descriptor state with its
    // caller. The broker keeps the exact immutable object it issued.
    descriptor = cloneAndFreeze(structuredClone(descriptor))
    validateGrantDescriptorPair(grant, descriptor)
    const budget = descriptorBudget(descriptor)
    assertValidUsedBudget(grant.used)
    assertValidUsedBudget(budget)
    const next = addBudget(grant.used, budget)
    assertValidUsedBudget(next)
    if (!withinBudget(next, grant.budget))
      throw new Error('ScopeGrant cumulative budget exceeded.')
    if (ctx.runId !== grant.runId || ctx.turnId !== grant.turnId)
      throw new Error('Capability context mismatch.')
    if (Date.now() >= grant.expiresAt) throw new Error('ScopeGrant expired.')
    // This synchronous section is the atomic reservation/counter update.
    grant.used = next
    const capabilityId = `permit-${++this.sequence}`
    const record: BrokerRecord = {
      grantId: grant.id,
      grant,
      runId: ctx.runId,
      turnId: ctx.turnId,
      phase: descriptor.kind === 'apply' ? 'apply' : 'external_call',
      status: 'reserved',
      expiresAt: grant.expiresAt,
      reservedBudget: budget,
      descriptor,
    }
    this.records.set(capabilityId, record)
    const execution: AuthorizedExecution =
      descriptor.kind === 'apply'
        ? {
            phase: 'apply',
            capabilityId,
            runId: ctx.runId,
            turnId: ctx.turnId,
            effectFingerprint: descriptor.effectFingerprint,
            preconditionHash: descriptor.preconditionHash,
            descriptor,
          }
        : {
            phase: 'external_call',
            capabilityId,
            runId: ctx.runId,
            turnId: ctx.turnId,
            effectFingerprint: descriptor.effectFingerprint,
            descriptor,
          }
    Object.freeze(execution)
    this.executions.set(execution, record)
    return execution
  }

  async issueDisclosurePermit(
    grant: ReadGrant,
    descriptor: AggregatedDisclosureDescriptor,
    ctx: { runId: string; turnId: string },
  ): Promise<string> {
    validateGrantDescriptorPair(grant, descriptor)
    const computedBytes = descriptor.segments.map(
      (segment) => new TextEncoder().encode(segment.content).byteLength,
    )
    const measured = computedBytes.reduce((sum, bytes) => sum + bytes, 0)
    const wireBytes = new TextEncoder().encode(
      JSON.stringify(descriptor.canonicalArguments),
    ).byteLength
    const files = new Set(
      descriptor.segments.flatMap((segment) => segment.canonicalVaultPaths),
    )
    if (
      measured !== descriptor.totalMeasuredBytes ||
      measured !== descriptor.measuredBytes ||
      wireBytes !== descriptor.wirePayloadBytes ||
      descriptor.segments.some(
        (segment, index) => segment.measuredBytes !== computedBytes[index],
      )
    )
      throw new Error(
        'Broker-measured disclosure bytes do not match descriptor.',
      )
    for (const segment of descriptor.segments) {
      if (!grant.allowedLevels.includes(segment.level))
        throw new Error(`Disclosure level ${segment.level} is not granted.`)
      const roots = grant.pathRoots.map(normalizePath)
      if (
        roots.length &&
        segment.canonicalVaultPaths.some(
          (path) =>
            !roots.some((root) => isWithinRoot(normalizePath(path), root)),
        )
      )
        throw new Error('Disclosure path is outside the ReadGrant roots.')
      if (segment.level === 'host_internal')
        throw new Error(
          'host_internal disclosure cannot reach a provider sink.',
        )
    }
    if (
      descriptor.segments.some(
        (segment) =>
          segment.unattributedFiles !== undefined &&
          (!Number.isInteger(segment.unattributedFiles) ||
            segment.unattributedFiles < 0),
      )
    )
      throw new Error('Invalid unattributed file count.')
    const budget = {
      maxCalls: 1,
      maxFiles:
        files.size +
        descriptor.segments.reduce(
          (sum, segment) => sum + (segment.unattributedFiles ?? 0),
          0,
        ),
      maxBytes: Math.max(measured, wireBytes),
      maxCost: descriptor.costUpperBound,
    }
    assertValidUsedBudget(grant.used)
    assertValidUsedBudget(budget)
    const next = addBudget(grant.used, budget)
    assertValidUsedBudget(next)
    if (!withinBudget(next, grant.budget))
      throw new Error('ReadGrant cumulative budget exceeded.')
    if (ctx.runId !== grant.runId || ctx.turnId !== grant.turnId)
      throw new Error('Disclosure context mismatch.')
    if (Date.now() >= grant.expiresAt) throw new Error('ReadGrant expired.')
    grant.used = next
    const capabilityId = `disclosure-${++this.sequence}`
    this.records.set(capabilityId, {
      grantId: grant.id,
      grant,
      runId: ctx.runId,
      turnId: ctx.turnId,
      phase: 'provider_disclosure',
      status: 'reserved',
      expiresAt: grant.expiresAt,
      reservedBudget: budget,
      descriptor,
    })
    return capabilityId
  }

  consume(capabilityId: string, ctx: { runId: string; turnId: string }): void {
    const record = this.records.get(capabilityId)
    if (!record || record.status !== 'reserved')
      throw new Error('Capability is missing, replayed, or already consumed.')
    if (record.runId !== ctx.runId || record.turnId !== ctx.turnId)
      throw new Error('Capability context mismatch.')
    if (Date.now() >= record.expiresAt) {
      returnReservedBudget(record)
      record.status = 'failed'
      throw new Error('Capability expired.')
    }
    record.status = 'consumed'
  }

  consumeExecution(
    execution: AuthorizedExecution,
    ctx: { runId: string; turnId: string },
  ): void {
    const record = this.executions.get(execution)
    if (
      !record ||
      record !== this.records.get(execution.capabilityId) ||
      record.descriptor !== execution.descriptor ||
      record.phase !== execution.phase
    )
      throw new Error(
        'Execution permit is not the immutable broker-issued object.',
      )
    this.consume(execution.capabilityId, ctx)
  }

  fail(capabilityId: string): void {
    const record = this.records.get(capabilityId)
    if (record?.status === 'reserved') {
      returnReservedBudget(record)
      record.status = 'failed'
    }
  }
}

export const capabilityBroker = new CapabilityBroker()

function makeDefaultReadGrant(ctx: DisclosureContext): ReadGrant {
  const now = Date.now()
  const pathRoots = ctx.approvedConnectorVaultRead
    ? ['']
    : [
        ...new Set(
          (ctx.segments ?? []).flatMap((segment) =>
            segment.canonicalVaultPaths.map(normalizePath),
          ),
        ),
      ]
  return {
    id: `read-${ctx.turnId ?? now}`,
    runId: ctx.runId ?? 'adhoc',
    turnId: ctx.turnId ?? `turn-${now}`,
    providerConfigHash: ctx.providerConfigHash ?? DEFAULT_PROVIDER,
    connectionGeneration: ctx.connectionGeneration ?? DEFAULT_GENERATION,
    expiresAt: now + 5 * 60_000,
    pathRoots,
    allowedLevels: ['metadata', 'snippet', 'content'],
    budget: {
      maxCalls: DEFAULT_MAX_CALLS,
      maxFiles: DEFAULT_MAX_FILES,
      maxBytes: DEFAULT_MAX_BYTES,
      maxCost: Number.MAX_SAFE_INTEGER,
    },
    used: { maxCalls: 0, maxFiles: 0, maxBytes: 0, maxCost: 0 },
  }
}

function getDefaultReadGrant(ctx: DisclosureContext): ReadGrant {
  const runId = ctx.runId ?? 'adhoc'
  const turnId = ctx.turnId ?? `turn-${Date.now()}`
  const key = JSON.stringify([
    runId,
    turnId,
    ctx.providerConfigHash ?? DEFAULT_PROVIDER,
    ctx.connectionGeneration ?? DEFAULT_GENERATION,
  ])
  const existing = defaultReadGrants.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing
  const grant = makeDefaultReadGrant({ ...ctx, runId, turnId })
  defaultReadGrants.set(key, grant)
  return grant
}

export async function authorizeProviderRequest(
  messages: readonly RequestMessage[],
  ctx: DisclosureContext = {},
): Promise<AuthorizedProviderRequest> {
  // Disclosure accounting, digest and final wire payload must describe the
  // same private snapshot even while hashing or broker reservation waits.
  messages = messages.map((message) => {
    const snapshot = structuredCloneSafe(message)
    normalizeMessageText(snapshot)
    return snapshot
  })
  ctx = structuredCloneSafe(ctx)
  const providerConfigHash = ctx.providerConfigHash ?? DEFAULT_PROVIDER
  const connectionGeneration = ctx.connectionGeneration ?? DEFAULT_GENERATION
  const turnId =
    ctx.turnId ?? `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const runId = ctx.runId ?? 'adhoc'
  const segments = (
    ctx.segments?.length
      ? ctx.segments
      : (connectorDisclosureSegments(messages) ?? [])
  ).map((segment) => ({
    ...segment,
    canonicalVaultPaths: segment.canonicalVaultPaths.map(normalizePath),
  }))
  const messageBytes = new TextEncoder().encode(
    JSON.stringify(messages),
  ).byteLength
  const effectiveSegments: DisclosureSegment[] = segments.length
    ? segments
    : [
        {
          level: 'content',
          origins: ['prompt-envelope'],
          canonicalVaultPaths: [],
          measuredBytes: messageBytes,
          content: JSON.stringify(messages),
        },
      ]
  // Explicit source segments may omit protocol metadata. Account for Items
  // here too; connector-derived segments already contain each full message.
  if (ctx.segments?.length) {
    effectiveSegments.push(
      ...(connectorDisclosureSegments(messages) ?? []).flatMap((segment, i) => {
        const message = messages[i]
        if (message.role === 'user' && 'toolImageSource' in message)
          return [segment]
        if ('disclosure' in message && message.disclosure)
          return [{ ...segment, content: '', measuredBytes: 0 }]
        return []
      }),
    )
    const replay = messages.flatMap((message) =>
      message.role === 'assistant' && message.responsesReplay
        ? [message.responsesReplay]
        : [],
    )
    if (replay.length) {
      const content = JSON.stringify(replay)
      effectiveSegments.push({
        level: 'content',
        origins: ['provider-continuation'],
        canonicalVaultPaths: [],
        measuredBytes: new TextEncoder().encode(content).byteLength,
        content,
      })
    }
  }
  const measuredBytes = effectiveSegments.reduce(
    (sum, segment) => sum + segment.measuredBytes,
    0,
  )
  const wirePayloadDigest = await canonicalDigest({
    providerConfigHash,
    connectionGeneration,
    messages,
  })
  const descriptor: AggregatedDisclosureDescriptor = {
    kind: 'provider_disclosure',
    effects: ['networkEgress'],
    measuredBytes,
    totalMeasuredBytes: measuredBytes,
    wirePayloadBytes: messageBytes,
    costUpperBound: 0,
    providerConfigHash,
    connectionGeneration,
    turnId,
    segments: effectiveSegments,
    wirePayloadDigest,
    canonicalArguments: messages,
    effectFingerprint: wirePayloadDigest,
  }
  const grant = getDefaultReadGrant({
    ...ctx,
    segments: effectiveSegments,
    runId,
    turnId,
    providerConfigHash,
    connectionGeneration,
  })
  const requestedPaths = new Set(
    effectiveSegments.flatMap((segment) => segment.canonicalVaultPaths),
  )
  if (
    requestedPaths.size > 0 &&
    grant.used.maxCalls > 0 &&
    grant.pathRoots.length === 0
  )
    throw new Error(
      'Disclosure path scope cannot be widened after a turn has started.',
    )
  const capabilityId = await capabilityBroker.issueDisclosurePermit(
    grant,
    descriptor,
    { runId, turnId },
  )
  const finalWireMessages = cloneAndFreeze(messages)
  const request = Object.freeze({
    capabilityId,
    runId,
    turnId,
    providerConfigHash,
    connectionGeneration,
    wirePayloadDigest,
    finalWireMessages,
    [authorizedProviderRequestBrand]: true,
  } as AuthorizedProviderRequest)
  issuedProviderRequests.add(request)
  return request
}

function structuredCloneSafe<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(structuredCloneSafe) as T
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      structuredCloneSafe(entry),
    ]),
  ) as T
}

/** Re-checks the exact immutable payload immediately before provider transport. */
export async function assertAuthorizedProviderRequest(
  request: AuthorizedProviderRequest,
  messages: readonly RequestMessage[],
): Promise<void> {
  if (
    (request as Partial<AuthorizedProviderRequest>)[
      authorizedProviderRequestBrand
    ] !== true ||
    !issuedProviderRequests.has(request)
  )
    throw new Error(
      'Provider request is not an authorized module-issued value.',
    )
  const digest = await canonicalDigest({
    providerConfigHash: request.providerConfigHash,
    connectionGeneration: request.connectionGeneration,
    messages,
  })
  if (digest !== request.wirePayloadDigest)
    throw new Error('Provider payload changed after disclosure authorization.')
  if (JSON.stringify(request.finalWireMessages) !== JSON.stringify(messages))
    throw new Error(
      'Provider wire payload does not match the authorized snapshot.',
    )
}

export function consumeAuthorizedProviderRequest(
  request: AuthorizedProviderRequest,
): void {
  if (
    (request as Partial<AuthorizedProviderRequest>)[
      authorizedProviderRequestBrand
    ] !== true ||
    !issuedProviderRequests.has(request)
  )
    throw new Error(
      'Provider request is not an authorized module-issued value.',
    )
  capabilityBroker.consume(request.capabilityId, {
    runId: request.runId,
    turnId: request.turnId,
  })
}

/** Compare the issued request with the caller's independently captured scope. */
export function assertProviderRequestContext(
  request: AuthorizedProviderRequest,
  context: DisclosureContext | undefined,
): void {
  if (
    (context?.runId !== undefined && request.runId !== context.runId) ||
    (context?.turnId !== undefined && request.turnId !== context.turnId) ||
    (context?.providerConfigHash !== undefined &&
      request.providerConfigHash !== context.providerConfigHash) ||
    (context?.connectionGeneration !== undefined &&
      request.connectionGeneration !== context.connectionGeneration)
  )
    throw new Error('Provider request context mismatch.')
}

export function materializeAuthorizedMessages(
  request: AuthorizedProviderRequest,
): RequestMessage[] {
  if (!issuedProviderRequests.has(request))
    throw new Error(
      'Provider request is not an authorized module-issued value.',
    )
  return structuredCloneSafe(request.finalWireMessages) as RequestMessage[]
}

export async function withAuthorizedProviderRequest<T>(
  messages: readonly RequestMessage[],
  ctx: DisclosureContext,
  send: (messages: RequestMessage[]) => Promise<T>,
): Promise<T> {
  const context = ctx ? { ...ctx } : undefined
  const request = await authorizeProviderRequest(
    messages,
    context && { ...context },
  )
  assertProviderRequestContext(request, context)
  const finalMessages = materializeAuthorizedMessages(request)
  consumeAuthorizedProviderRequest(request)
  await assertAuthorizedProviderRequest(request, finalMessages)
  return send(finalMessages)
}

export async function issueApplyPermit(
  change: ProposedChange,
  runId: string,
  turnId = `apply-${change.id}`,
): Promise<AuthorizedExecution> {
  change = structuredClone(change)
  const descriptor = await finalizeApplyDescriptor(
    await buildApplyDescriptor(change),
  )
  return capabilityBroker.issueExecutionPermit(
    scopeGrantForApprovedChange(change, runId, turnId),
    descriptor,
    { runId, turnId },
  )
}

async function issueCallPermit(
  input: {
    name: string
    args: unknown
    runId: string
    turnId: string
    serverConfigHash: string
    connectionGeneration: number
    toolSchemaHash: string
    destination: string
  },
  effect: 'networkEgress' | 'vaultRead' | 'externalMutation',
): Promise<AuthorizedExecution> {
  input = structuredClone(input)
  const canonicalArguments = { name: input.name, args: input.args }
  const effectFingerprint = await canonicalDigest(canonicalArguments)
  const descriptor: ExternalCallDescriptor = {
    kind: 'external_call',
    op: 'external_call',
    tool: input.name,
    destination: input.destination,
    serverConfigHash: input.serverConfigHash,
    connectionGeneration: input.connectionGeneration,
    toolSchemaHash: input.toolSchemaHash,
    effects: [effect],
    measuredBytes: new TextEncoder().encode(JSON.stringify(input.args))
      .byteLength,
    costUpperBound: 0,
    canonicalArguments,
    effectFingerprint,
  }
  const grant: ScopeGrant = {
    id: `user-permit-${effectFingerprint}`,
    runId: input.runId,
    turnId: input.turnId,
    expiresAt: Date.now() + 60_000,
    allowedEffects: [effect],
    allowedOps: ['external_call'],
    pathRoots: [],
    budget: {
      maxCalls: 1,
      maxFiles: 0,
      maxBytes: descriptor.measuredBytes,
      maxCost: 0,
    },
    used: { maxCalls: 0, maxFiles: 0, maxBytes: 0, maxCost: 0 },
    providerIdentity: {
      serverConfigHash: input.serverConfigHash,
      connectionGeneration: input.connectionGeneration,
      toolSchemaHash: input.toolSchemaHash,
    },
    allowedDestinations: [input.destination],
  }
  return capabilityBroker.issueExecutionPermit(grant, descriptor, {
    runId: input.runId,
    turnId: input.turnId,
  })
}

export function issueExternalCallPermit(
  input: Parameters<typeof issueCallPermit>[0],
): Promise<AuthorizedExecution> {
  return issueCallPermit(input, 'networkEgress')
}
export function issueLocalPluginCallPermit(
  input: Parameters<typeof issueCallPermit>[0],
): Promise<AuthorizedExecution> {
  return issueCallPermit(input, 'vaultRead')
}

/**
 * An edit of a provider's unsaved working copy (v1.12). The destination names
 * the provider session, so the permit cannot be spent on another document.
 */
export function issueProviderSessionEditPermit(
  input: Parameters<typeof issueCallPermit>[0],
): Promise<AuthorizedExecution> {
  return issueCallPermit(input, 'externalMutation')
}

/**
 * A provider write of user files (v1.13). Issued only after the write set was
 * checkpointed; the destination names one preparation, so it is spent once.
 */
export function issueProviderCommitPermit(
  input: Parameters<typeof issueCallPermit>[0],
): Promise<AuthorizedExecution> {
  return issueCallPermit(input, 'externalMutation')
}

/** Host dispatch only: this destination cannot authorize a provider commit. */
export function issueHostCommitDispatchPermit(
  input: Omit<Parameters<typeof issueCallPermit>[0], 'destination'> & {
    providerId: string
  },
): Promise<AuthorizedExecution> {
  const { providerId, ...bound } = input
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(providerId))
    throw new Error('Invalid provider ID for host commit dispatch.')
  return issueCallPermit(
    {
      ...bound,
      destination: `plugin://${providerId}/agentinterop/host-commit-dispatch`,
    },
    'externalMutation',
  )
}

export function consumeAuthorizedExecution(
  execution: AuthorizedExecution,
  ctx: { runId: string; turnId: string },
): void {
  if (execution.phase !== 'apply' && execution.phase !== 'external_call')
    throw new Error('Execution phase is not consumable.')
  if (execution.descriptor.effectFingerprint !== execution.effectFingerprint)
    throw new Error('Execution fingerprint mismatch.')
  capabilityBroker.consumeExecution(execution, ctx)
}

export type BinaryWritePermitInput = {
  runId: string
  turnId: string
  proposalId: string
  path: string
  sourceHash: string
  resultHash: string
  resultSizeBytes: number
  checkpointId: string
}

async function binaryWriteDescriptor(
  input: BinaryWritePermitInput,
): Promise<ModifyDescriptor> {
  const canonicalArguments = { kind: 'binary-write', ...input }
  return {
    kind: 'apply',
    op: 'modify',
    path: input.path,
    before: null,
    after: null,
    preconditionHash: input.sourceHash,
    batch: 'none',
    effects: ['vaultWrite'],
    measuredBytes: input.resultSizeBytes,
    costUpperBound: 0,
    canonicalArguments,
    effectFingerprint: await canonicalDigest(canonicalArguments),
  }
}

/** Internal permit for an already approved, checkpointed binary proposal. */
export async function issueBinaryWritePermit(
  input: BinaryWritePermitInput,
): Promise<AuthorizedExecution> {
  input = { ...input }
  const descriptor = await binaryWriteDescriptor(input)
  const grant: ScopeGrant = {
    id: `binary-${input.proposalId}`,
    runId: input.runId,
    turnId: input.turnId,
    expiresAt: Date.now() + 60_000,
    allowedEffects: ['vaultWrite'],
    allowedOps: ['modify'],
    pathRoots: [input.path],
    budget: {
      maxCalls: 1,
      maxFiles: 1,
      maxBytes: input.resultSizeBytes,
      maxCost: 0,
    },
    used: { maxCalls: 0, maxFiles: 0, maxBytes: 0, maxCost: 0 },
  }
  return capabilityBroker.issueExecutionPermit(grant, descriptor, input)
}

export async function assertBinaryWriteMatches(
  execution: AuthorizedExecution,
  input: BinaryWritePermitInput,
): Promise<void> {
  if (!execution || execution.phase !== 'apply')
    throw new Error('Binary apply permit required.')
  const expected = await binaryWriteDescriptor({ ...input })
  if (
    execution.descriptor.path !== expected.path ||
    execution.descriptor.op !== expected.op ||
    execution.descriptor.measuredBytes !== expected.measuredBytes ||
    execution.effectFingerprint !== expected.effectFingerprint ||
    execution.preconditionHash !== expected.preconditionHash
  )
    throw new Error('Binary write no longer matches the authorized proposal.')
}

export async function assertExternalCallMatches(
  execution: AuthorizedExecution,
  input: {
    name: string
    args: unknown
    destination: string
    effect: 'networkEgress' | 'vaultRead' | 'externalMutation'
    providerIdentity: {
      serverConfigHash: string
      connectionGeneration: number
      toolSchemaHash: string
    }
  },
): Promise<void> {
  if (execution.phase !== 'external_call')
    throw new Error('External-call permit required.')
  const descriptor = execution.descriptor
  const digest = await canonicalDigest({ name: input.name, args: input.args })
  if (
    descriptor.tool !== input.name ||
    descriptor.destination !== input.destination ||
    descriptor.effects.length !== 1 ||
    descriptor.effects[0] !== input.effect ||
    digest !== descriptor.effectFingerprint ||
    descriptor.serverConfigHash !== input.providerIdentity.serverConfigHash ||
    descriptor.connectionGeneration !==
      input.providerIdentity.connectionGeneration ||
    descriptor.toolSchemaHash !== input.providerIdentity.toolSchemaHash
  )
    throw new Error('MCP request no longer matches the authorized exact call.')
}

export async function assertApplyMatches(
  execution: AuthorizedExecution,
  change: ProposedChange,
  content: string | null,
): Promise<void> {
  if (execution.phase !== 'apply') throw new Error('Apply permit required.')
  const descriptor = await finalizeApplyDescriptor(
    await buildApplyDescriptor({ ...change, after: content }),
  )
  if (
    descriptor.path !== execution.descriptor.path ||
    descriptor.op !== execution.descriptor.op ||
    descriptor.effectFingerprint !== execution.effectFingerprint ||
    descriptor.preconditionHash !== execution.preconditionHash
  )
    throw new Error('Apply payload no longer matches the authorized change.')
}

export async function buildApplyDescriptor(
  change: ProposedChange,
  batch: ApplyDescriptor['batch'] = 'none',
): Promise<ApplyDescriptor> {
  const sourceDependenciesFingerprint = change.sourceDependencies?.length
    ? await sourceDependenciesDigest(change.sourceDependencies)
    : undefined
  const binarySourceDependenciesFingerprint = change.binarySourceDependencies
    ?.length
    ? await canonicalDigest(
        change.binarySourceDependencies
          .map(({ path, sha256Before }) => ({
            path: normalizePath(path),
            sha256Before,
          }))
          .sort((a, b) =>
            a.path < b.path
              ? -1
              : a.path > b.path
                ? 1
                : a.sha256Before < b.sha256Before
                  ? -1
                  : a.sha256Before > b.sha256Before
                    ? 1
                    : 0,
          ),
      )
    : undefined
  const base = {
    kind: 'apply' as const,
    op: change.op,
    path: change.path,
    before: change.before,
    after: change.after,
    preconditionHash: '',
    batch,
    sourceDependenciesFingerprint,
    binarySourceDependenciesFingerprint,
    approvalMode: change.approvalMode,
    effects: [
      'vaultWrite' as const,
      ...(change.op === 'delete' || change.dangerous
        ? (['destructive'] as const)
        : []),
    ],
    measuredBytes: change.composite
      ? change.composite.entries.reduce(
          (total, entry) =>
            total + new TextEncoder().encode(entry.after ?? '').byteLength,
          0,
        )
      : new TextEncoder().encode(change.after ?? '').byteLength,
    ...(change.composite
      ? {
          compositePaths: change.composite.entries.flatMap((entry) => [
            normalizePath(entry.path),
            ...(entry.originalPath ? [normalizePath(entry.originalPath)] : []),
          ]),
        }
      : {}),
    costUpperBound: 0,
    canonicalArguments: {
      op: change.op,
      path: change.path,
      ...(change.originalPath ? { originalPath: change.originalPath } : {}),
      before: change.before,
      after: change.after,
      // A composite apply writes every entry; bind the whole write set.
      // JSON round trip drops undefined `after` keys canonicalize rejects.
      ...(change.composite
        ? { composite: JSON.parse(JSON.stringify(change.composite)) as unknown }
        : {}),
    },
    effectFingerprint: '',
  }
  return (
    change.op === 'rename' || change.op === 'move'
      ? {
          ...base,
          op: change.op,
          sourcePath: change.originalPath ?? change.path,
          destinationPath: change.path,
        }
      : base
  ) as ApplyDescriptor
}

async function sourceDependenciesDigest(
  dependencies: readonly SourceDependency[],
): Promise<string> {
  const entries = await Promise.all(
    dependencies.map(async (dependency) => ({
      path: normalizePath(dependency.path),
      hash: await sha256Hex(
        dependency.beforeContent === null ? 'null' : dependency.beforeContent,
      ),
    })),
  )
  entries.sort((left, right) =>
    left.path === right.path
      ? left.hash.localeCompare(right.hash)
      : left.path.localeCompare(right.path),
  )
  return canonicalDigestJson(JSON.stringify(entries))
}

export async function finalizeApplyDescriptor(
  descriptor: ApplyDescriptor,
): Promise<ApplyDescriptor> {
  const preconditionHash = await canonicalDigest({
    path: descriptor.path,
    before: descriptor.before,
  })
  const sourceDependenciesFingerprint = descriptor.sourceDependenciesFingerprint
  const effectFingerprint = await canonicalDigest({
    canonicalArguments: descriptor.canonicalArguments,
    preconditionHash,
    batch: descriptor.batch,
    ...(sourceDependenciesFingerprint ? { sourceDependenciesFingerprint } : {}),
    ...(descriptor.binarySourceDependenciesFingerprint
      ? {
          binarySourceDependenciesFingerprint:
            descriptor.binarySourceDependenciesFingerprint,
        }
      : {}),
    ...(descriptor.approvalMode
      ? { approvalMode: descriptor.approvalMode }
      : {}),
  })
  return {
    ...descriptor,
    preconditionHash,
    sourceDependenciesFingerprint,
    effectFingerprint,
  }
}

export function scopeGrantForApprovedChange(
  change: ProposedChange,
  runId: string,
  turnId = `apply-${change.id}`,
): ScopeGrant {
  return {
    id: `grant-${change.id}`,
    runId,
    turnId,
    expiresAt: Date.now() + 60_000,
    allowedEffects: [
      'vaultWrite',
      ...(change.op === 'delete' || change.dangerous
        ? (['destructive'] as const)
        : []),
    ],
    allowedOps: [change.op],
    pathRoots: [
      ...new Set([
        normalizePath(change.path),
        ...(change.originalPath ? [normalizePath(change.originalPath)] : []),
        ...(change.composite?.entries.flatMap((entry) => [
          normalizePath(entry.path),
          ...(entry.originalPath ? [normalizePath(entry.originalPath)] : []),
        ]) ?? []),
      ]),
    ],
    budget: {
      maxCalls: 1,
      maxFiles: new Set([
        normalizePath(change.path),
        ...(change.originalPath ? [normalizePath(change.originalPath)] : []),
        ...(change.composite?.entries.flatMap((entry) => [
          normalizePath(entry.path),
          ...(entry.originalPath ? [normalizePath(entry.originalPath)] : []),
        ]) ?? []),
      ]).size,
      maxBytes: Number.MAX_SAFE_INTEGER,
      maxCost: Number.MAX_SAFE_INTEGER,
    },
    used: { maxCalls: 0, maxFiles: 0, maxBytes: 0, maxCost: 0 },
  }
}
