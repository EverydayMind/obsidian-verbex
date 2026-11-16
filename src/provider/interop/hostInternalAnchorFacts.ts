import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import type { CommitRuntime } from './commitPrepare'
import type { HostContext } from './editorActions'
import type { OutputAnchorCapture } from './outputAnchorCapture'
import { resolveHostAnchorRefs } from './resolveSavedAnchorRefs'
import { savedOutputAnchorLeaseView } from './savedOutputAnchorView'

/** Capabilities close over the private lease and cannot outlive it. */
export function hostInternalAnchorFacts(input: {
  host: HostContext
  runtime: CommitRuntime
  capture: OutputAnchorCapture
  outcome: AgentToolOutcome
  conversationId: string
  leaseId: string
  signal?: AbortSignal
}) {
  const { host, runtime, capture, outcome, conversationId, leaseId, signal } =
    input
  return {
    getOutputAnchors: (preparationId: string) =>
      capture.getLease(leaseId, preparationId),
    readBoundAnchors: async () =>
      outcome.commit?.state === 'written'
        ? (
            await savedOutputAnchorLeaseView(
              runtime,
              capture,
              outcome.commit,
              conversationId,
              leaseId,
            )
          )?.pages
        : undefined,
    resolveOutputAnchorRefs: (blockIndices: readonly number[]) => {
      if (!outcome.commit || outcome.commit.state !== 'written')
        throw new Error('No written checkpoint for anchor lookup.')
      return resolveHostAnchorRefs(
        host,
        runtime,
        capture,
        outcome.commit,
        conversationId,
        leaseId,
        blockIndices,
        signal,
      )
    },
  }
}
