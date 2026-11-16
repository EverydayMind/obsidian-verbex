import type { ProviderCheckpointStore } from '../../checkpoint/ProviderCheckpointStore'
import {
  type AgentToolOutcome,
  toolFailed,
  toolRejected,
  toolSucceeded,
} from '../../core/llm/toolOutcome'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { ownershipErrorText, ownershipRetryable } from '../ownershipTypes'

import type { CommitCall } from './commitCall'
import {
  copyCommitArguments,
  deliverCommitPreparation,
  preparedReportLines,
} from './commitCallHelpers'
import { changedSincePrepared } from './commitDisk'
import {
  assertPreparedOwnership,
  assertResolvedOwnership,
} from './commitOwnership'
import * as wording from './commitPrepareText'
import { type CommitPreparation, parsePreparation } from './commitProtocol'
import type { ProviderHandle } from './discovery'
import { withTimeout } from './discoveryLifecycle'
import { ownershipHostBlock } from './hostBlockState'
import {
  limitOutputAnchorLease,
  outputAnchorCapability,
} from './outputAnchorRead'
import type { Caller } from './protocol'
import { callProvider } from './providerCall'
import { RESOLVE_TIMEOUT_MS } from './sessionExecution'
import { type ResolvedTarget, parseResolvedTarget } from './sessionProtocol'
import { copyTurnScope, turnScopeFor } from './turnScope'

export const COMMIT_CALL_TIMEOUT_MS = 120_000

export type CommitApprovalRequest = {
  providerId: string
  providerName: string
  pluginVersion: string
  toolTitle: string
  mode: CommitPreparation['mode']
  source?: string
  template?: string
  destination: string
  writeSet: {
    path: string
    kind: 'file' | 'folder'
    op: 'modify' | 'create'
    sizeBytes?: number
  }[]
  /** Provider-reported wording. Shown as the provider's statement, not as a host fact. */
  internalWrites: string[]
  notes: string[]
  expiresAt: string
}
export type CommitApprovalHandler = (
  request: CommitApprovalRequest,
  signal?: AbortSignal,
) => Promise<'allow' | 'reject'>

/** What the host needs besides the call itself. Without it every commit fails closed. */
export type CommitRuntime = import('./outputAnchorRead').OutputAnchorRuntime & {
  checkpoints: ProviderCheckpointStore
  /** Registers the checkpoint with its run. Resolves only once that is durable. */
  linkRun: (runId: string, checkpointId: string) => Promise<void>
  approve?: CommitApprovalHandler
  /** Lower-cased paths of commits in flight, shared with rollback. */
  locks: Set<string>
  timeoutMs?: number
}
export type { CommitCall } from './commitCall'

/** An approved preparation that still matched the document and the disk a moment ago. */
export type PreparedCommit = {
  commit: NonNullable<ProviderHandle['commit']>
  runtime: CommitRuntime
  runId: string
  caller: Caller
  requestId: string
  target: ResolvedTarget
  destination: string
  preparation: CommitPreparation
  /** Ledger identity of this save: provider, submitted turn, tool and destination. */
  common: () => { mutationScope: 'vault'; mutationKey: string }
  notWritten: (message: string, retryable: boolean) => AgentToolOutcome
  /** A failure when the disk no longer matches the "before" side of the preparation. */
  changed: () => Promise<AgentToolOutcome | undefined>
  stopped: () => boolean
  invocation: (signal: AbortSignal) => unknown
  outputAnchors?: import('./outputAnchorRead').OutputAnchorCapability
}

export const errorText = (error: unknown, fallback: string): string =>
  ownershipErrorText(error, fallback, 300)

/**
 * The part of a commit that cannot change a user file (control contract
 * v1.13): fix the target, let the provider prepare the exact bytes in memory,
 * check the preparation and the disk, ask the user about this one write, then
 * check target, expiry and disk again. Returns an outcome when the commit
 * ends here.
 */
export async function prepareCommit(
  call: CommitCall,
): Promise<AgentToolOutcome | PreparedCommit> {
  const { handle, ctx, tool, args, runtime, app } = call
  const commit = handle.commit
  const providerId = handle.pluginId
  const runId = ctx.runId
  const requestId = ctx.turnId ?? call.name
  const signal = ctx.signal ?? new AbortController().signal
  const argsDigest = await canonicalDigest(args)
  const submittedTurn = ctx.submittedTurnId ?? ctx.turnId ?? runId ?? 'native'
  let destination = ''
  const common = () => ({
    mutationScope: 'vault' as const,
    mutationKey: `plg:${providerId}:${submittedTurn}:${tool.name}:${destination || argsDigest}`,
  })
  const notWritten = (message: string, retryable: boolean, error?: unknown) =>
    toolFailed(wording.failed(message), {
      terminal: false,
      retry: { allowed: retryable },
      ...common(),
      ...ownershipHostBlock(error),
    })
  if (!commit || !handle.resolveTarget || !runtime)
    return notWritten(wording.unavailable(), false)
  const outputAnchors = outputAnchorCapability(call, commit, runtime)
  // A checkpoint belongs to a run, so there is no save outside one.
  if (!runId) return notWritten(wording.runRequired(), false)
  const caller: Caller = {
    pluginId: call.selfId,
    conversationId: ctx.conversationId ?? runId,
    runId,
    turnId: submittedTurn,
  }
  const scope = turnScopeFor(
    ctx.snapshot?.turnScope,
    providerId,
    call.generation,
  )
  const stopped = () => !!ctx.signal?.aborted || !call.current()
  const resolve = async (): Promise<ResolvedTarget> => {
    const resolved = parseResolvedTarget(
      await withTimeout(
        Promise.resolve().then(() =>
          Reflect.apply(handle.resolveTarget as never, handle.provider, [
            tool.name,
            copyCommitArguments(call),
            {
              caller: { ...caller },
              scope: copyTurnScope(scope),
              requestId,
              signal,
            },
          ]),
        ),
        call.resolveTimeoutMs ?? RESOLVE_TIMEOUT_MS,
        wording.resolveTimeout(),
      ),
    )
    const paths =
      resolved.kind === 'existing'
        ? [resolved.document.path, resolved.destination ?? '']
        : [resolved.destination, resolved.template?.path ?? '']
    if (paths.some((item) => item && call.vaultPath(item) !== item))
      throw new Error(wording.invalidPath())
    await assertResolvedOwnership(call, resolved)
    return resolved
  }

  // 1. The provider fixes source and destination. Nothing changes here.
  let target: ResolvedTarget
  call.trace?.mark('resolve.start', { providerId, generation: call.generation })
  try {
    target = await resolve()
    destination =
      target.kind === 'existing'
        ? (target.destination ?? target.document.path)
        : target.destination
    call.trace?.mark('resolve.end', { path: destination })
  } catch (error) {
    return notWritten(
      errorText(error, wording.resolveFailed()),
      ownershipRetryable(error, true),
      error,
    )
  }
  if (stopped()) return notWritten(wording.cancelled(), false)
  if (call.busy.has(providerId)) return notWritten(wording.busy(), true)
  const invocation = (callSignal: AbortSignal) => ({
    caller: { ...caller },
    requestId,
    signal: callSignal,
    actor: { kind: 'agent', label: 'Verbex' },
    scope: copyTurnScope(scope),
    target: parseResolvedTarget(target),
  })

  // 2. The provider prepares the exact bytes in memory. It must not write user files.
  let preparation: CommitPreparation
  try {
    const { raw } = await callProvider({
      trace: call.trace,
      app,
      busy: call.busy,
      providerId,
      signal: ctx.signal,
      timeoutMs: runtime.timeoutMs ?? COMMIT_CALL_TIMEOUT_MS,
      invoke: (callSignal) => {
        // Preparation is provider-owned; it must not retain mutable host
        // arguments or the host's resolved target for a later commit.
        const providerTarget = parseResolvedTarget(target)
        return Reflect.apply(commit.prepare, commit.receiver, [
          {
            tool: tool.name,
            args: copyCommitArguments(call),
            target: providerTarget,
            ...(outputAnchors ? { captureOutputAnchors: true } : {}),
          },
          { ...invocation(callSignal), target: providerTarget },
        ])
      },
    })
    preparation = await parsePreparation(raw, target, call.vaultPath)
    limitOutputAnchorLease(runtime, outputAnchors, preparation.expiresAt)
  } catch (error) {
    return notWritten(errorText(error, wording.prepareFailed()), false)
  }
  if (stopped()) return notWritten(wording.cancelled(), false)
  const changed = async (): Promise<AgentToolOutcome | undefined> => {
    try {
      await assertPreparedOwnership(call, target, preparation)
      const where = await changedSincePrepared(app, preparation)
      return where === undefined
        ? undefined
        : notWritten(wording.changed(where), true)
    } catch (error) {
      return notWritten(
        errorText(error, wording.readFailed()),
        ownershipRetryable(error, true),
        error,
      )
    }
  }
  let stale = await changed()
  if (stale) return stale
  // A clean document with nothing to write: a verified no-change result, no checkpoint.
  if (!preparation.writeSet.length)
    return toolSucceeded(
      wording.noChanges(providerId, tool.name, destination),
      { ...common(), mutationResolution: 'resolved' },
    )

  // 3. Approval of this one write. Never remembered; every commit asks.
  const rejected = (message: string) =>
    toolRejected(wording.rejected(message), common())
  if (!runtime.approve) return rejected(wording.approvalUnavailable())
  call.trace?.mark('approval.start')
  let decision: 'allow' | 'reject' = 'reject'
  try {
    decision = await runtime.approve(
      {
        providerId,
        providerName: call.providerName,
        pluginVersion: handle.pluginVersion,
        toolTitle: tool.title ?? tool.name,
        mode: preparation.mode,
        ...(preparation.source ? { source: preparation.source.path } : {}),
        ...(preparation.template
          ? { template: preparation.template.path }
          : {}),
        destination,
        writeSet: preparation.writeSet.map((entry) => ({
          path: entry.path,
          kind: entry.kind,
          op: entry.op,
          ...(entry.kind === 'file' ? { sizeBytes: entry.sizeBytes } : {}),
        })),
        internalWrites: preparation.providerInternalWrites,
        notes: [
          ...preparedReportLines(preparation.report.summary),
          ...preparedReportLines(preparation.report.warnings),
        ],
        expiresAt: preparation.expiresAt,
      },
      ctx.signal,
    )
  } catch {
    // A broken approval screen is a refusal, not a permission.
  }
  call.trace?.mark(decision === 'allow' ? 'approval.allow' : 'approval.reject')
  if (decision !== 'allow') return rejected(wording.userRejected(destination))

  // 4. What was approved must still be what is there: target, expiry, disk.
  if (stopped()) return notWritten(wording.cancelled(), false)
  if (Date.parse(preparation.expiresAt) <= Date.now())
    return notWritten(wording.expired(), true)
  try {
    const again = await canonicalDigest(await resolve())
    if (again !== (await canonicalDigest(target)))
      return notWritten(wording.changedDuringApproval(), true)
  } catch (error) {
    return notWritten(
      errorText(error, wording.recheckFailed()),
      ownershipRetryable(error, true),
      error,
    )
  }
  if ((stale = await changed())) return stale
  deliverCommitPreparation(call, preparation)
  if (call.beforeCheckpoint) {
    await call.beforeCheckpoint(preparation)
    if (stopped()) return notWritten(wording.cancelled(), false)
  }
  return {
    commit,
    runtime,
    runId,
    caller,
    requestId,
    target,
    destination,
    preparation,
    common,
    notWritten,
    changed,
    stopped,
    invocation,
    outputAnchors,
  }
}
