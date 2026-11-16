import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'

import {
  DocumentOutputBlocked,
  observedDocumentJob,
} from './documentJobProduceGuard'
import { HostCommitNotStarted } from './hostInternalCommitTypes'

/** Only typed failures raised before checkpoint creation can be retried safely. */
export function documentJobCommitFailure(error: unknown): AgentToolOutcome {
  if (error instanceof DocumentOutputBlocked)
    return observedDocumentJob(error.fact)
  if (error instanceof HostCommitNotStarted) {
    if (error.code === 'commit_not_ready')
      return observedDocumentJob({
        state: 'exporter_commit_not_ready',
        cause: error.readinessCause ?? 'commit_disabled',
      })
    return toolFailed(JSON.stringify({ state: 'failed', code: error.code }), {
      terminal: false,
      retry: { allowed: true },
      mutationScope: 'none',
    })
  }
  return {
    status: 'paused',
    terminal: true,
    mutation: 'unknown',
    mutationScope: 'vault',
    retry: { allowed: false },
    displayText:
      'Save status could not be confirmed; inspect the output and checkpoints before retrying.',
  }
}

/** This wrapper is called only by the approved, pre-checkpoint callback. */
export async function runBeforeDocumentJobCheckpoint(
  check: () => Promise<void>,
): Promise<void> {
  try {
    await check()
  } catch (error) {
    if (
      error instanceof DocumentOutputBlocked ||
      error instanceof HostCommitNotStarted
    )
      throw error
    throw new HostCommitNotStarted('pre_checkpoint_failed')
  }
}
