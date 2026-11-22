import type { ToolCallRequest } from '../../types/tool-call.types'

import type {
  AgentLoopDeps,
  AgentToolExecutionResult,
  AgentToolExecutor,
} from './agentLoop'

export async function sequential(
  calls: ToolCallRequest[],
  executeTool: AgentToolExecutor,
): Promise<AgentToolExecutionResult[]> {
  const results: AgentToolExecutionResult[] = []
  for (const call of calls) results.push(await executeTool(call))
  return results
}

/** Only the first, human-submitted seed can reach the internal export capability. */
export async function executeHumanSeedCalls(
  calls: ToolCallRequest[],
  deps: AgentLoopDeps,
) {
  const executeHumanSeed = deps.executeHumanSeed
  if (
    executeHumanSeed &&
    calls.some((call) => call.name === 'export_census_report')
  )
    return sequential(calls, (call) =>
      call.name === 'export_census_report'
        ? executeHumanSeed(call)
        : deps.executeTool(call),
    )
  return deps.executeToolBatch
    ? deps.executeToolBatch(calls)
    : sequential(calls, deps.executeTool)
}
