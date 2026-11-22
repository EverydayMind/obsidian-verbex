import type { AgentExecutionPorts } from './agentExecutionPorts'
import type { Context } from './agentToolExecution'
import { emitToolWriteAudit } from './agentWriteAudit'
import type { AgentToolOutcome } from './core/llm/toolOutcome'
import { toolFailed, vaultMutated } from './core/llm/toolOutcome'
import { applyLocalChange } from './core/tools/applyLocalChange'
import { nonChangeResultOutcome } from './core/tools/readOutcome'
import type { turnToolTracker } from './runstate/turnToolTracker'
import { assertWorkActive } from './runtime/PluginRuntimeLifecycle'
import type { ToolCallRequest } from './types/tool-call.types'

export function createCensusSeedExecutor(
  ctx: Context,
  tracker: ReturnType<typeof turnToolTracker>,
  record: (
    call: ToolCallRequest,
    outcome: AgentToolOutcome,
  ) => AgentToolOutcome,
  refuse: (name: string) => Promise<AgentToolOutcome>,
) {
  return async (call: ToolCallRequest) => {
    const { input, ports } = ctx
    assertWorkActive(input.signal)
    if (
      call.name !== 'export_census_report' ||
      !ctx.toolsEnabled ||
      input.excludedToolNames?.includes(call.name) ||
      ports.providerRegistry?.nativeToolReady?.(call.name) === false
    )
      return record(call, await refuse(call.name))
    const outcome = await tracker.execute(
      call,
      () => executeCensusExportSeed(ports, input, call),
      false,
    )
    if (vaultMutated(outcome))
      emitToolWriteAudit(
        input.onAuditEvent,
        input.runId,
        call.name,
        outcome.changedPath ?? '',
      )
    return outcome
  }
}

/** This capability is supplied only to the loop's human seed branch. */
export async function executeCensusExportSeed(
  ports: AgentExecutionPorts,
  input: { runId: string; signal?: AbortSignal },
  call: ToolCallRequest,
) {
  let args: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(call.arguments ?? '')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error()
    args = parsed as Record<string, unknown>
  } catch {
    return toolFailed('export_census_report: invalid JSON arguments')
  }
  const result = await ports.localTools.execute(call.name, args, input)
  if (result.kind !== 'change') return nonChangeResultOutcome(result, call.name)
  // The existing create pipeline owns permission, approval, checkpoint and apply.
  // Its outcome text contains status and path only; never the proposed body.
  return applyLocalChange({
    runId: input.runId,
    signal: input.signal,
    result,
    stepExecutor: ports.stepExecutor,
    outcomes: ports.runs,
    openAppliedNotes: true,
  })
}
