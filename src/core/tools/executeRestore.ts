import type { AgentToolOutcome } from '../llm/toolOutcome'

import * as modelText from './executeRestoreText'
import type { ToolResult } from './localToolCommon'

export async function executeRestore(
  handler:
    | ((runId: string, signal?: AbortSignal) => Promise<AgentToolOutcome>)
    | undefined,
  runId?: string,
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (!runId || !handler)
    return { kind: 'error', message: modelText.unavailable() }
  return { kind: 'outcome', outcome: await handler(runId, signal) }
}
