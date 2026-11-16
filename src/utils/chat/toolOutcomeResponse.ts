import type { AgentToolOutcome } from '../../core/llm/agentLoop'
import {
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'

import { classifyVerbexToolResult } from './largeFileCard'

export function toolOutcomeResponse(
  text: string,
  outcome?: AgentToolOutcome,
): ToolCallResponse {
  const receipt = {
    ...(outcome?.binaryReceipt ? { binaryReceipt: outcome.binaryReceipt } : {}),
    ...(outcome?.reportStyleReceipt
      ? { reportStyleReceipt: outcome.reportStyleReceipt }
      : {}),
  }
  const status = outcome
    ? {
        succeeded: ToolCallResponseStatus.Success,
        rejected: ToolCallResponseStatus.Rejected,
        failed: ToolCallResponseStatus.Error,
        paused: ToolCallResponseStatus.Aborted,
      }[outcome.status]
    : classifyVerbexToolResult(text)
  if (status === ToolCallResponseStatus.Success)
    return {
      status,
      ...receipt,
      ...(outcome?.readFacts ? { readFacts: outcome.readFacts } : {}),
      data: {
        type: 'text',
        text,
        ...(outcome?.disclosure ? { disclosure: outcome.disclosure } : {}),
      },
    }
  if (
    status === ToolCallResponseStatus.Rejected ||
    status === ToolCallResponseStatus.Aborted
  )
    return { status, ...receipt }
  return {
    ...receipt,
    status: ToolCallResponseStatus.Error,
    error: text,
    ...(outcome?.readFacts ? { readFacts: outcome.readFacts } : {}),
  }
}
