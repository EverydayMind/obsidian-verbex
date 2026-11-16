import type { ExecutionExecutor } from './contextPacker'

export type ExecutionRouteEntryPoint =
  | 'unit_batch'
  | 'agent_loop'
  | 'capacity_error'

export type ExecutionRoute = {
  executor: ExecutionExecutor
  entryPoint: ExecutionRouteEntryPoint
}

/**
 * Convert the plan's executor fact into the coordinator entry point.
 *
 * The requested entry point comes from the deterministic turn plan, while the
 * executor comes from the packed ExecutionPlan. A mismatch is a harness
 * error, not a reason to guess or fall back to another executor.
 */
export function resolveExecutionRoute(input: {
  executor: ExecutionExecutor
  requestedEntryPoint: 'unit_batch' | 'agent_loop'
}): ExecutionRoute {
  if (input.executor === 'capacity_error') {
    return {
      executor: input.executor,
      entryPoint: 'capacity_error',
    }
  }

  const entryPoint =
    input.executor === 'unit_batch' ? 'unit_batch' : 'agent_loop'
  if (entryPoint !== input.requestedEntryPoint) {
    throw new Error(
      `execution route mismatch: executor=${input.executor}, requested=${input.requestedEntryPoint}`,
    )
  }
  return { executor: input.executor, entryPoint }
}
