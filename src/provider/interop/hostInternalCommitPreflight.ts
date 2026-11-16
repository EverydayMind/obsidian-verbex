import { commitAllowed } from './commitPolicy'
import { validateDocumentJobArgs } from './documentJobArgs'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import type { HostContext } from './editorActions'
import {
  HostCommitNotStarted,
  type InternalCommitInput,
} from './hostInternalCommitTypes'
import type { NativeHostOptions } from './hostOptions'

/** All checks here occur before preparation, checkpoint, and provider execution. */
export async function prepareHostInternalCommit(
  host: HostContext,
  options: NativeHostOptions,
  input: InternalCommitInput,
) {
  const { providerId, toolName, context } = input
  if (
    providerId !== 'md-to-hwpx' ||
    !['export_note', 'derive_template'].includes(toolName)
  )
    throw new HostCommitNotStarted('tool_not_permitted')
  if (!context.conversationId || !context.runId || !context.turnId)
    throw new HostCommitNotStarted('identity_missing')
  if (
    !Number.isSafeInteger(input.expectedPolicyRevision) ||
    input.expectedPolicyRevision < 0
  )
    throw new HostCommitNotStarted('policy_revision_invalid')
  try {
    await host.refresh(context.signal)
  } catch {
    throw new HostCommitNotStarted('refresh_failed')
  }
  const binding = {
    descriptorDigest: input.expectedDigest,
    policyRevision: input.expectedPolicyRevision,
  }
  const found = host.getActiveDiscovered(providerId)
  const tool = found?.descriptor?.tools.find((item) => item.name === toolName)
  const runtime = options.commitRuntime
  const capture = options.outputAnchorCapture
  const readiness = assessDocumentJobReadiness(host, options, binding, toolName)
  if (
    !found ||
    !tool ||
    readiness.state !== 'ready' ||
    tool.effect !== 'commit' ||
    !runtime ||
    !capture ||
    !options.commitPolicy ||
    runtime.outputAnchors !== capture.accept ||
    runtime.outputAnchorRequested !== capture.requested ||
    runtime.outputAnchorLeaseCurrent !== capture.leaseCurrent ||
    runtime.outputAnchorLeaseLimit !== capture.limitLease ||
    found.digest !== input.expectedDigest ||
    !host.isCurrent(providerId, toolName) ||
    !commitAllowed(options, found, tool, input.expectedPolicyRevision)
  )
    throw new HostCommitNotStarted(
      'commit_not_ready',
      readiness.state === 'unavailable'
        ? 'provider_unavailable'
        : readiness.state === 'not_ready'
          ? readiness.cause
          : 'tool_disabled',
    )
  const { args, problem } = validateDocumentJobArgs(input.args, tool)
  if (problem) throw new HostCommitNotStarted('invalid_arguments')
  return { binding, found, tool, runtime, capture, args }
}
