import type { AgentToolOutcome } from '../core/llm/toolOutcome'

import * as modelText from './restoreLastChangeOutcomeText'
import { remainingChangesFact } from './restoreRemainingFact'
import type { RunCheckpointDispatcher } from './RunCheckpointDispatcher'

export async function restoreLastChangeOutcome(
  dispatcher: RunCheckpointDispatcher | undefined,
  runId: string,
  signal?: AbortSignal,
): Promise<AgentToolOutcome> {
  if (!dispatcher || !runId.startsWith('chat-'))
    return {
      status: 'failed',
      terminal: false,
      mutation: 'none',
      displayText: modelText.unavailable(),
    }
  try {
    signal?.throwIfAborted()
    const result = await dispatcher.restoreLastChange(runId, signal)
    if (result.state === 'none')
      return {
        status: 'succeeded',
        terminal: false,
        mutation: 'none',
        displayText: modelText.none(),
      }
    if (result.state === 'unsupported')
      return {
        status: 'failed',
        terminal: false,
        mutation: 'none',
        displayText: modelText.unsupported(),
      }
    if (result.state === 'rejected')
      return {
        status: 'rejected',
        terminal: false,
        mutation: 'none',
        displayText: modelText.rejected(),
      }
    if (result.state === 'failed')
      return {
        status: 'paused',
        terminal: true,
        mutation: 'unknown',
        displayText: modelText.failed(),
      }
    const paths = result.report?.restored ?? []
    const baseText = modelText.restored(
      paths.join(', '),
      (result.changed ?? []).join(', ') || modelText.empty(),
      result.omitted ?? 0,
    )
    const remainingCount = result.remainingCount ?? 0
    const displayText =
      remainingCount > 0
        ? baseText +
          remainingChangesFact(
            remainingCount,
            (result.remainingPaths ?? []).join(', ') || modelText.empty(),
          )
        : baseText
    return {
      status: 'succeeded',
      terminal: false,
      mutation: 'applied',
      mutationScope: 'vault',
      artifacts: { paths: JSON.stringify(paths) },
      displayText,
    }
  } catch {
    return {
      status: 'failed',
      terminal: false,
      mutation: 'none',
      displayText: modelText.unknownTarget(),
    }
  }
}
