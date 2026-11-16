import { commitTurnFacts } from '../../runstate/commitTurnFacts'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { executeCommitTool } from './commitExecution'
import { commitAllowed } from './commitPolicy'
import { assertPreparedDerivation } from './documentJobIdentity'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import type { HostContext } from './editorActions'
import {
  authorizeDocumentJobDispatch,
  authorizeHostCommitDispatch,
} from './hostCommitDispatch'
import { hostInternalAnchorFacts } from './hostInternalAnchorFacts'
import { prepareHostInternalCommit } from './hostInternalCommitPreflight'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type {
  InternalCommitFacts,
  InternalCommitInput,
} from './hostInternalCommitTypes'
import type { NativeHostOptions } from './hostOptions'
import { nativeToolName } from './protocol'

/** Host Job entry point. Never exposed as a model tool and never bypasses commit approval. */
export async function withHostInternalCommit<T>(
  host: HostContext,
  options: NativeHostOptions,
  input: InternalCommitInput,
  handleFacts: (facts: InternalCommitFacts) => Promise<T>,
): Promise<T> {
  const { providerId, toolName, context } = input
  const { binding, found, tool, runtime, capture, args } =
    await prepareHostInternalCommit(host, options, input)
  const current = () => {
    const latest = host.getActiveDiscovered(providerId)
    return (
      !context.signal?.aborted &&
      !!latest &&
      latest.handle.provider === found.handle.provider &&
      latest.digest === found.digest &&
      latest.generation === found.generation &&
      assessDocumentJobReadiness(host, options, binding, toolName).state ===
        'ready' &&
      host.isCurrent(providerId, toolName) &&
      commitAllowed(options, found, tool, input.expectedPolicyRevision)
    )
  }
  const name = nativeToolName(providerId, toolName)
  await authorizeDocumentJobDispatch(
    async () =>
      authorizeHostCommitDispatch({
        name,
        args,
        providerId,
        current,
        busy: host.busy,
        providerIdentity: {
          serverConfigHash: found.digest,
          connectionGeneration: found.generation,
          toolSchemaHash: await canonicalDigest(tool.inputSchema),
        },
        runId: context.runId,
        turnId: context.turnId,
      }),
    () => assessDocumentJobReadiness(host, options, binding, toolName),
  )

  let lease: ReturnType<typeof capture.acquireHostLease>
  try {
    lease = capture.acquireHostLease(context.conversationId, context.runId)
  } catch {
    throw new HostCommitNotStarted('anchor_lease_unavailable')
  }
  try {
    let preparation: InternalCommitFacts['preparation']
    const outcome = await executeCommitTool({
      app: host.app,
      busy: host.busy,
      selfId: host.selfId,
      vaultPath: host.vaultPath,
      name,
      tool,
      handle: found.handle,
      digest: found.digest,
      generation: found.generation,
      args,
      ctx: context,
      current,
      providerName: found.descriptor?.provider.name ?? providerId,
      runtime,
      hostOutputAnchorLeaseId: lease.leaseId,
      beforeCheckpoint: input.beforeCheckpoint,
      onPrepared: (prepared) => {
        if (toolName === 'export_note')
          assertPreparedDerivation(args, prepared.report)
        preparation = prepared
      },
      reportFault: () => host.reportProviderFault?.(found.handle),
      assertOwnership: (path, ownershipOptions) =>
        options.assertOwnership?.(path, providerId, ownershipOptions) ??
        Promise.resolve(),
      callTimeoutMs: host.callTimeoutMs,
      resolveTimeoutMs: host.resolveTimeoutMs,
    })
    return await handleFacts({
      outcome,
      turnCommit: commitTurnFacts(outcome),
      ...(preparation ? { preparation } : {}),
      ...hostInternalAnchorFacts({
        host,
        runtime,
        capture,
        outcome,
        conversationId: context.conversationId,
        leaseId: lease.leaseId,
        signal: context.signal,
      }),
    })
  } finally {
    lease.release()
  }
}
