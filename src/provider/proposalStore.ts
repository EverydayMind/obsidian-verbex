import { sha256HexBytes } from '../utils/hash'

import {
  BinaryProposalSummary,
  KordocBinaryChangeDraft,
  KordocDraftValidation,
  KordocSemanticChange,
} from './contract'

export type ProposalStatus =
  | 'pending'
  | 'validated'
  | 'approved'
  | 'rejected'
  | 'committed'
  | 'stale'
  | 'expired'
  | 'invalidated'

export type BinaryProposal = BinaryProposalSummary & {
  status: ProposalStatus
  validation?: KordocDraftValidation
}

export type StoredBinaryProposal = BinaryProposal & {
  draft: Omit<KordocBinaryChangeDraft, 'data'> & { data: Uint8Array }
}

export type ProposalStoreOptions = {
  ttlMs?: number
  maxProposalBytes?: number
  maxTotalBytes?: number
  now?: () => number
  idFactory?: () => string
}

const DEFAULT_TTL_MS = 10 * 60 * 1000
const DEFAULT_MAX_PROPOSAL_BYTES = 32 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 128 * 1024 * 1024

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function defaultId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    )
  }
  return `proposal-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`
}

/** Bounded, non-persistent storage for provider-produced binary drafts. */
export class BinaryProposalStore {
  private readonly entries = new Map<string, StoredBinaryProposal>()
  private readonly ttlMs: number
  private readonly maxProposalBytes: number
  private readonly maxTotalBytes: number
  private readonly now: () => number
  private readonly idFactory: () => string
  private totalBytes = 0
  private pendingBytes = 0
  private readonly pending = new Set<{
    runId?: string
    providerGeneration: string
    invalidated: boolean
  }>()

  constructor(options: ProposalStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.maxProposalBytes =
      options.maxProposalBytes ?? DEFAULT_MAX_PROPOSAL_BYTES
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
    this.now = options.now ?? Date.now
    this.idFactory = options.idFactory ?? defaultId
    if (
      this.ttlMs <= 0 ||
      this.maxProposalBytes <= 0 ||
      this.maxTotalBytes <= 0
    ) {
      throw new Error('proposal store limits must be positive')
    }
  }

  async put(input: {
    draft: KordocBinaryChangeDraft
    registrySnapshotId: string
    providerGeneration: string
    sourceSizeBytes?: number
  }): Promise<BinaryProposal> {
    this.cleanup()
    const originalDraft = input.draft
    const originalBytes = originalDraft.data
    const size = originalBytes.byteLength
    if (size > this.maxProposalBytes) {
      throw new Error('binary proposal exceeds the per-proposal byte limit')
    }
    if (this.totalBytes + this.pendingBytes + size > this.maxTotalBytes) {
      throw new Error('binary proposal store exceeds its total byte limit')
    }
    this.pendingBytes += size
    let pending:
      | { runId?: string; providerGeneration: string; invalidated: boolean }
      | undefined
    try {
      const draft = cloneDraft(originalDraft, originalBytes)
      const registrySnapshotId = input.registrySnapshotId
      const sourceSizeBytes = input.sourceSizeBytes ?? 0
      pending = {
        runId: draft.context?.runId,
        providerGeneration: input.providerGeneration,
        invalidated: false,
      }
      this.pending.add(pending)
      const data = draft.data
      const independentResultHash = await sha256HexBytes(data)
      if (independentResultHash !== draft.resultHash) {
        throw new Error('binary proposal resultHash does not match its bytes')
      }
      if (pending.invalidated) throw new Error('binary proposal invalidated')
      const createdAt = this.now()
      let proposalId = this.idFactory()
      while (this.entries.has(proposalId)) proposalId = this.idFactory()
      const expiresAt = createdAt + this.ttlMs
      const summary: BinaryProposal = {
        proposalId,
        providerId: draft.providerId,
        providerVersion: draft.providerVersion,
        targetPath: String(draft.targetPath),
        sourceHash: draft.sourceHash,
        resultHash: independentResultHash,
        sourceSizeBytes,
        resultSizeBytes: data.byteLength,
        baseSessionRevision: draft.baseSessionRevision,
        resultSessionRevision: draft.resultSessionRevision,
        applied: draft.applied,
        changes: cloneChanges(draft.changes),
        createdAt: new Date(createdAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        registrySnapshotId,
        ...(draft.context?.runId ? { runId: draft.context.runId } : {}),
        ...(draft.context?.turnId ? { turnId: draft.context.turnId } : {}),
        status: 'pending',
      }
      this.entries.set(proposalId, {
        ...summary,
        draft,
      })
      this.totalBytes += data.byteLength
      return this.publicView(summary)
    } finally {
      if (pending) this.pending.delete(pending)
      this.pendingBytes -= size
    }
  }

  get(proposalId: string): StoredBinaryProposal | null {
    this.cleanup()
    const entry = this.entries.get(proposalId)
    if (!entry) return null
    return this.cloneEntry(entry)
  }

  markValidated(
    proposalId: string,
    validation: KordocDraftValidation,
  ): BinaryProposal {
    const entry = this.requireMutable(proposalId)
    if (entry.status !== 'pending') {
      throw new Error(`proposal ${proposalId} is not pending validation`)
    }
    entry.validation = cloneValidation(validation)
    entry.status = validation.ok ? 'validated' : 'invalidated'
    if (!validation.ok) this.remove(proposalId)
    return this.publicView(entry)
  }

  approve(proposalId: string): BinaryProposal {
    const entry = this.requireMutable(proposalId)
    if (entry.status !== 'validated') {
      throw new Error(`proposal ${proposalId} is not validated`)
    }
    entry.status = 'approved'
    return this.publicView(entry)
  }

  reject(proposalId: string): boolean {
    const entry = this.entries.get(proposalId)
    if (!entry) return false
    entry.status = 'rejected'
    this.remove(proposalId)
    return true
  }

  markStale(proposalId: string): boolean {
    const entry = this.entries.get(proposalId)
    if (!entry) return false
    entry.status = 'stale'
    this.remove(proposalId)
    return true
  }

  consume(proposalId: string): boolean {
    this.cleanup()
    const entry = this.entries.get(proposalId)
    if (!entry || entry.status !== 'approved') return false
    entry.status = 'committed'
    this.remove(proposalId)
    return true
  }

  invalidateRun(runId: string): number {
    for (const pending of this.pending)
      if (pending.runId === runId) pending.invalidated = true
    return this.removeWhere((entry) => entry.runId === runId)
  }

  invalidateGeneration(providerGeneration: string): number {
    for (const pending of this.pending)
      if (pending.providerGeneration === providerGeneration)
        pending.invalidated = true
    return this.removeWhere(
      (entry) => entry.draft.context?.providerGeneration === providerGeneration,
    )
  }

  clear(): void {
    for (const pending of this.pending) pending.invalidated = true
    this.entries.clear()
    this.totalBytes = 0
  }

  size(): number {
    this.cleanup()
    return this.entries.size
  }

  getBytesUsed(): number {
    this.cleanup()
    return this.totalBytes
  }

  private requireMutable(proposalId: string): StoredBinaryProposal {
    this.cleanup()
    const entry = this.entries.get(proposalId)
    if (!entry) throw new Error(`proposal ${proposalId} not found or expired`)
    return entry
  }

  private cleanup(): void {
    const now = this.now()
    for (const [id, entry] of this.entries) {
      if (Date.parse(entry.expiresAt) <= now) {
        entry.status = 'expired'
        this.remove(id)
      }
    }
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    this.totalBytes -= entry.draft.data.byteLength
    this.entries.delete(id)
  }

  private removeWhere(
    predicate: (entry: StoredBinaryProposal) => boolean,
  ): number {
    let removed = 0
    for (const [id, entry] of this.entries) {
      if (predicate(entry)) {
        this.remove(id)
        removed += 1
      }
    }
    return removed
  }

  private cloneEntry(entry: StoredBinaryProposal): StoredBinaryProposal {
    return {
      ...entry,
      changes: cloneChanges(entry.changes),
      draft: cloneDraft(entry.draft),
      ...(entry.validation
        ? { validation: cloneValidation(entry.validation) }
        : {}),
    }
  }

  private publicView(entry: BinaryProposal): BinaryProposal {
    return { ...entry, changes: cloneChanges(entry.changes) }
  }
}

function cloneChanges(changes: KordocSemanticChange[]): KordocSemanticChange[] {
  return changes.map((change) => ({ ...change }))
}

function cloneDraft(
  draft: KordocBinaryChangeDraft,
  bytes = draft.data,
): KordocBinaryChangeDraft {
  return {
    ...draft,
    data: cloneBytes(bytes),
    changes: cloneChanges(draft.changes),
    ...(draft.context ? { context: { ...draft.context } } : {}),
  }
}

function cloneValidation(
  validation: KordocDraftValidation,
): KordocDraftValidation {
  return {
    ...validation,
    issues: validation.issues.map((issue) => ({ ...issue })),
  }
}
