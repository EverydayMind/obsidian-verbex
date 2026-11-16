import type {
  ExecutionExecutor,
  ExecutionPlan,
} from './core/batch/contextPacker'
import type { AgentLoopResult } from './core/llm/agentLoop'
import { attributeExecutionCoverage } from './core/routing/coverage'

/** Attribute execution facts and present a large-document badge without I/O. */
export function finalizeAgentResult(
  loopResult: AgentLoopResult,
  plan: ExecutionPlan,
  executor: ExecutionExecutor,
  runId: string,
  largeFileBadge: string | null,
): AgentLoopResult {
  const result = { ...loopResult }
  if (
    largeFileBadge &&
    result.finalText &&
    !result.finalText.startsWith('> 📄')
  ) {
    result.finalText = `${largeFileBadge}\n\n${result.finalText}`
  }
  result.executor = executor
  if (plan.coverage && result.coverage === undefined) {
    const outcome =
      result.stoppedReason === 'completed'
        ? ('completed' as const)
        : result.stoppedReason === 'paused'
          ? ('paused' as const)
          : ('failed' as const)
    const attributedCoverage = attributeExecutionCoverage({
      coverage: plan.coverage,
      packets: plan.packed.packets,
      includedPacketIds: plan.packed.includedPacketIds,
      outcome,
      outputEmpty: result.finalText.trim().length === 0,
      outputRef: `agent:${runId}:final`,
    })
    if (attributedCoverage) result.coverage = attributedCoverage
  }

  return result
}
