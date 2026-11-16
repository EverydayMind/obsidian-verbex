import { App } from 'obsidian'

import { BinaryCheckpointManager } from '../checkpoint/BinaryCheckpointManager'
import {
  assertBinaryWriteMatches,
  consumeAuthorizedExecution,
  issueBinaryWritePermit,
} from '../security/promptInjectionBoundary'
import { sha256HexBytes } from '../utils/hash'

import {
  KordocBinaryChangeDraft,
  KordocDraftValidation,
  normalizeProviderPath,
} from './contract'
import type { InteropDiagnostics } from './interop/diagnostics'
import { BinaryProposal, BinaryProposalStore } from './proposalStore'

export type BinaryCommitResult = {
  proposalId: string
  checkpointId: string
  path: string
  resultHash: string
  resultSizeBytes: number
}

/** A write was attempted; never replay this proposal even if its receipt failed. */
export class BinaryCommitError extends Error {
  constructor(
    message: string,
    readonly receipt: BinaryCommitResult,
    readonly mutation: 'applied' | 'none' | 'unknown',
  ) {
    super(message)
  }
}

export type BinaryPipelineOptions = {
  checkpoints?: BinaryCheckpointManager
}

/** Host-owned validation, approval, checkpoint, recheck, and binary write sink. */
export class BinaryCommitPipeline {
  diagnostics?: InteropDiagnostics
  assertOwnership?: (path: string) => Promise<void>
  private readonly locks = new Set<string>()
  private readonly targetLocks = new Set<string>()
  private readonly checkpoints: BinaryCheckpointManager

  constructor(
    private readonly app: App,
    readonly proposals: BinaryProposalStore,
    options: BinaryPipelineOptions = {},
  ) {
    this.checkpoints = options.checkpoints ?? new BinaryCheckpointManager(app)
  }

  async validate(
    proposalId: string,
    validator: (
      draft: KordocBinaryChangeDraft,
    ) => Promise<KordocDraftValidation>,
  ): Promise<BinaryProposal> {
    const proposal = this.proposals.get(proposalId)
    if (!proposal)
      throw new Error(`proposal ${proposalId} not found or expired`)
    // The caller supplies the provider callback. The actual draft type is
    // intentionally inferred in ProviderRegistry, while this boundary only
    // stores the validator's typed result.
    const validation = await validator(proposal.draft)
    return this.proposals.markValidated(proposalId, validation)
  }

  async approve(
    proposalId: string,
    approved: boolean,
  ): Promise<BinaryProposal> {
    if (!approved) {
      this.proposals.reject(proposalId)
      throw new Error('binary proposal rejected by user')
    }
    return this.proposals.approve(proposalId)
  }

  async commit(proposalId: string): Promise<BinaryCommitResult> {
    const trace = this.diagnostics?.begin('binary.commit', { proposalId })
    if (this.locks.has(proposalId)) {
      trace?.finish('busy', { busy: true })
      throw new Error(
        `binary proposal ${proposalId} is already being committed`,
      )
    }
    this.locks.add(proposalId)
    let lockedPath: string | undefined
    try {
      const proposal = this.proposals.get(proposalId)
      if (!proposal)
        throw new Error(`proposal ${proposalId} not found or expired`)
      if (proposal.status !== 'approved') {
        throw new Error(`proposal ${proposalId} requires explicit approval`)
      }
      const path = normalizeProviderPath(proposal.targetPath)
      if (this.targetLocks.has(path))
        throw new Error(
          `binary proposal target is already being committed: ${path}`,
        )
      this.targetLocks.add(path)
      lockedPath = path
      await this.assertOwnership?.(path)
      trace?.mark('checkpoint.start', { path, runId: proposal.runId })
      const file = this.app.vault.getAbstractFileByPath(path)
      if (!isVaultFile(file)) {
        this.proposals.markStale(proposalId)
        throw new Error(`binary proposal target is missing: ${path}`)
      }

      // Snapshot the exact bytes that will be restored by rollback. A
      // checkpoint failure stops the pipeline before any write is attempted.
      const before = new Uint8Array(
        await this.app.vault.readBinary(
          file as Parameters<typeof this.app.vault.readBinary>[0],
        ),
      ).slice()
      const beforeHash = await sha256HexBytes(before)
      if (beforeHash !== proposal.sourceHash) {
        trace?.mark('source.conflict')
        this.proposals.markStale(proposalId)
        throw new Error(
          `binary proposal sourceHash is stale for ${path}; expected ${proposal.sourceHash}, got ${beforeHash}`,
        )
      }
      const checkpoint = await this.checkpoints.create(
        proposal.runId ?? 'unscoped',
        {
          contentKind: 'binary',
          path,
          before,
          mediaType: 'application/vnd.hancom.hwpx',
        },
      )
      trace?.mark('checkpoint.end')

      // Re-read after checkpoint creation before authorizing the exact write.
      await this.assertOwnership?.(path)
      const current = new Uint8Array(
        await this.app.vault.readBinary(
          file as Parameters<typeof this.app.vault.readBinary>[0],
        ),
      )
      const currentHash = await sha256HexBytes(current)
      if (currentHash !== proposal.sourceHash) {
        trace?.mark('source.conflict')
        this.proposals.markStale(proposalId)
        throw new Error(
          `binary proposal sourceHash is stale for ${path}; expected ${proposal.sourceHash}, got ${currentHash}`,
        )
      }

      const result = new Uint8Array(proposal.draft.data)
      const resultHash = await sha256HexBytes(result)
      if (resultHash !== proposal.resultHash) {
        this.proposals.markStale(proposalId)
        throw new Error('binary proposal changed while waiting for approval')
      }
      const permitInput = {
        runId: proposal.runId ?? 'unscoped',
        turnId: proposal.turnId ?? `binary-${proposalId}`,
        proposalId,
        path,
        sourceHash: currentHash,
        resultHash,
        resultSizeBytes: result.byteLength,
        checkpointId: checkpoint.id,
      }
      const permit = await issueBinaryWritePermit(permitInput)
      await assertBinaryWriteMatches(permit, permitInput)
      // Permit issuance and validation can yield while the file changes.
      // Recheck ownership, file identity and bytes before spending the permit.
      await this.assertOwnership?.(path)
      if (this.app.vault.getAbstractFileByPath(path) !== file) {
        this.proposals.markStale(proposalId)
        throw new Error(`binary proposal target changed for ${path}`)
      }
      const latest = new Uint8Array(
        await this.app.vault.readBinary(
          file as Parameters<typeof this.app.vault.readBinary>[0],
        ),
      )
      if ((await sha256HexBytes(latest)) !== currentHash) {
        this.proposals.markStale(proposalId)
        throw new Error(`binary proposal sourceHash is stale for ${path}`)
      }
      if (this.app.vault.getAbstractFileByPath(path) !== file) {
        this.proposals.markStale(proposalId)
        throw new Error(`binary proposal target changed for ${path}`)
      }
      consumeAuthorizedExecution(permit, permitInput)
      trace?.mark('apply.start')
      // Consume before entering the write sink: a rejected promise may still
      // have changed the file. Retrying the proposal would be unsafe.
      if (!this.proposals.consume(proposalId))
        throw new Error('binary proposal is no longer approved or has expired')
      const receipt: BinaryCommitResult = {
        proposalId,
        checkpointId: checkpoint.id,
        path,
        resultHash,
        resultSizeBytes: result.byteLength,
      }
      let mutation: 'applied' | 'none' | 'unknown' = 'unknown'
      try {
        await this.app.vault.modifyBinary(
          file as Parameters<typeof this.app.vault.modifyBinary>[0],
          result.slice().buffer,
        )
        trace?.mark('apply.end', { count: result.byteLength })
        const after = new Uint8Array(
          await this.app.vault.readBinary(
            file as Parameters<typeof this.app.vault.readBinary>[0],
          ),
        )
        const afterHash = await sha256HexBytes(after)
        mutation =
          afterHash === resultHash
            ? 'applied'
            : afterHash === currentHash
              ? 'none'
              : 'unknown'
        if (mutation !== 'applied')
          throw new Error(
            'binary write readback does not match the approved result',
          )
        await this.checkpoints.recordAfter(
          checkpoint.runId,
          checkpoint.id,
          path,
          afterHash,
        )
      } catch (error) {
        // Even a failed write can have applied bytes. Preserve the observed
        // state, checkpoint reference and uncertainty instead of inviting retry.
        if (mutation === 'unknown') {
          try {
            const after = new Uint8Array(
              await this.app.vault.readBinary(
                file as Parameters<typeof this.app.vault.readBinary>[0],
              ),
            )
            const hash = await sha256HexBytes(after)
            mutation =
              hash === resultHash
                ? 'applied'
                : hash === currentHash
                  ? 'none'
                  : 'unknown'
          } catch {
            /* readback remains unknown */
          }
        }
        throw new BinaryCommitError(
          error instanceof Error ? error.message : String(error),
          receipt,
          mutation,
        )
      }
      trace?.finish('succeeded')
      return receipt
    } catch (error) {
      trace?.finish('failed')
      throw error
    } finally {
      if (lockedPath !== undefined) this.targetLocks.delete(lockedPath)
      this.locks.delete(proposalId)
    }
  }

  async restore(runId: string, checkpointId: string): Promise<void> {
    const work = () => this.checkpoints.restore(runId, checkpointId)
    if (this.diagnostics)
      await this.diagnostics.measure('binary.restore', { runId }, work)
    else await work()
  }
}

function isVaultFile(value: unknown): value is { path: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { path?: unknown }).path === 'string',
  )
}
