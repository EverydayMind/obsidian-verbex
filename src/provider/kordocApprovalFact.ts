import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import { parseToolArgs } from '../core/tools/parseToolArgs'
import { asVaultPath, isAiPrivatePath } from '../security/aiPrivatePaths'
import type { ToolCallRequest } from '../types/tool-call.types'

import { pendingApprovalReadFact } from './interop/pendingApprovalFact'
import type { PendingPluginApproval } from './interop/pendingPluginApprovals'

/**
 * A failed built-in KORDOC call gets one fact line naming plugins that await
 * approval. Decided from the outcome status and the call arguments only; an
 * AI-private refusal is left as it is.
 */
export function appendKordocApprovalFact(
  registry: { pendingPluginApprovals?: () => PendingPluginApproval[] },
  call: ToolCallRequest,
  outcome: AgentToolOutcome,
): AgentToolOutcome {
  if (!call.name.startsWith('kordoc__') || outcome.status !== 'failed')
    return outcome
  const path = parseToolArgs(call.arguments).path
  if (typeof path === 'string' && isAiPrivatePath(asVaultPath(path)))
    return outcome
  const fact = pendingApprovalReadFact(
    registry.pendingPluginApprovals?.() ?? [],
  )
  return fact
    ? { ...outcome, displayText: `${outcome.displayText}\n${fact}` }
    : outcome
}
