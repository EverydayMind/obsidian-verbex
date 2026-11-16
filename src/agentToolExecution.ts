import type { AgentExecutionPorts } from './agentExecutionPorts'
import type { AgentRunExecution } from './AgentRunExecution'
import type { prepareAgentTurnPlan } from './agentTurnPlanning'
import { emitToolWriteAudit } from './agentWriteAudit'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { RepeatedToolCalls } from './context/repeatedToolCalls'
import type { AgentLoopDeps, AgentToolOutcome } from './core/llm/agentLoop'
import {
  toolFailed,
  toolOutcomeFromChange,
  vaultMutated,
} from './core/llm/toolOutcome'
import { nonChangeResultOutcome } from './core/tools/readOutcome'
import {
  CANONICAL_TOOL_MAP,
  getToolCatalog,
} from './core/tools/toolDefinitions'
import {
  normalizeLocalToolCall,
  unknownToolArgs,
} from './core/tools/unknownToolArgs'
import * as toolBatches from './provider/executeSelectedCalls'
import type { ProviderRegistrySnapshot } from './provider/ProviderRegistry'
import {
  classifyToolExposure,
  refusedTool,
} from './provider/toolExposureRefusal'
import type { TurnRecord } from './runstate/turnLedger'
import { turnToolTracker } from './runstate/turnToolTracker'
import { assertWorkActive } from './runtime/PluginRuntimeLifecycle'
import type { ToolCallRequest } from './types/tool-call.types'
import { summarizeOutcome } from './utils/changeOutcome'

type Planning = Awaited<ReturnType<typeof prepareAgentTurnPlan>>
type Context = {
  ports: AgentExecutionPorts
  input: Parameters<AgentRunExecution['run']>[0]
  turnRecord: TurnRecord
  toolsEnabled: boolean
  callableToolNames: ReadonlySet<string>
  workflowRuntime: Planning['workflowRuntime']
  plan: Extract<Planning['plan'], { kind: 'agent_loop' }>
  providerSnapshot?: ProviderRegistrySnapshot
  isPrivateTool: (name: string) => boolean
  onUnexposedTool?: (name: string) => void
  reexposeTool?: (name: string) => Promise<boolean>
}

/** The actual execution boundary owns facts; UI result publication may never run. */
export function createAgentToolExecution(ctx: Context): Required<
  Pick<AgentLoopDeps, 'executeTool' | 'executeToolBatch'>
> & {
  repeats: RepeatedToolCalls
} {
  const { ports, input, toolsEnabled, workflowRuntime, plan } = ctx
  const runId = input.runId
  const tracker = turnToolTracker(ctx.turnRecord)
  const repeats = new RepeatedToolCalls()
  const refuse = async (name: string) => {
    const fixed = [
      ...(input.activeSkills ?? []).flatMap((skill) => skill.tools ?? []),
      ...(input.workflowContext ?? [])
        .filter((workflow) => workflow.included)
        .flatMap(
          (workflow) =>
            workflow.steps?.flatMap((step) => (step.tool ? [step.tool] : [])) ??
            [],
        ),
    ]
    const reason = classifyToolExposure(
      name,
      ports.providerRegistry,
      ctx.providerSnapshot,
      input.excludedToolNames ?? [],
      fixed,
      toolsEnabled,
    )
    const reexposed =
      reason === 'not_exposed' && !!(await ctx.reexposeTool?.(name))
    if (reason === 'not_exposed' && !reexposed) ctx.onUnexposedTool?.(name)
    return refusedTool(name, reason, reexposed)
  }
  const record = (call: ToolCallRequest, outcome: AgentToolOutcome) => {
    tracker.result(
      call,
      ctx.isPrivateTool(call.name)
        ? { ...outcome, privateTranscript: true }
        : outcome,
    )
    return outcome
  }
  const execute = async (call: ToolCallRequest, openOutput?: boolean) => {
    assertWorkActive(input.signal)
    const outcome = await tracker.execute(
      call,
      () =>
        ports.tools.executeAgentTool(
          runId,
          call,
          input.workflowContext,
          input.onStatusChange,
          input.signal,
          input.onConfirmLargeOperation,
          workflowRuntime?.activeStepId,
          input.onConfirmWikiTarget,
          input.activeSkills,
          openOutput,
          ctx.providerSnapshot,
          input.companionScope,
        ),
      ctx.isPrivateTool(call.name),
    )
    if (outcome.auditEvent)
      emitAgentAuditEvent(
        input.onAuditEvent,
        runId,
        outcome.auditEvent.kind,
        outcome.auditEvent.summary,
      )
    if (vaultMutated(outcome)) {
      const args = ports.tools.parseToolArgs(call.arguments)
      const targetPath = typeof args.path === 'string' ? args.path : ''
      emitToolWriteAudit(input.onAuditEvent, runId, call.name, targetPath)
    }
    return outcome
  }
  return {
    repeats,
    executeTool: async (call) => {
      assertWorkActive(input.signal)
      if (
        !toolsEnabled ||
        !ctx.callableToolNames.has(CANONICAL_TOOL_MAP[call.name] ?? call.name)
      )
        return repeats.observe(call, record(call, await refuse(call.name)))
      return repeats.observe(
        call,
        await execute(call, plan.activeStep?.openOutput),
      )
    },
    executeToolBatch: async (calls) => {
      const callableToolNames = new Set(ctx.callableToolNames)
      const providerSnapshot = ctx.providerSnapshot
      calls = calls.map((call) =>
        normalizeLocalToolCall(
          call,
          (name) => ports.providerRegistry?.hasTool(name) === true,
        ),
      )
      if (
        toolBatches.requiresSequentialExecutor(
          calls,
          ports.tools.hasBatchPathConflict(calls),
          (name) => ports.providerRegistry?.hasTool(name) ?? false,
        )
      ) {
        const results = await toolBatches.executeSelectedCalls(
          calls,
          (call) => execute(call),
          toolsEnabled ? callableToolNames : new Set<string>(),
          input.signal,
          refuse,
        )
        const observed: AgentToolOutcome[] = []
        let stopped = false
        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          observed.push(
            stopped ? result : await repeats.observe(calls[i], result),
          )
          if (
            result.status === 'paused' ||
            input.signal?.aborted ||
            (calls[i].name === 'save_format_decomposition' &&
              result.terminal &&
              (result.mutation === 'partial' || result.mutation === 'unknown'))
          )
            stopped = true
        }
        return observed
      }
      const items = await Promise.all(
        calls.map(async (call) => {
          assertWorkActive(input.signal)
          const verificationFailure = ports.tools.verifyAgentWriteDetailed(
            call,
            input.workflowContext ?? [],
            workflowRuntime?.activeStepId,
          )
          tracker.start(call)
          const unknownArgs = ports.providerRegistry?.hasTool(call.name)
            ? undefined
            : unknownToolArgs(
                call.name,
                ports.tools.parseToolArgs(call.arguments),
                getToolCatalog().registry[call.name]?.definition,
              )
          const result =
            toolsEnabled && callableToolNames.has(call.name)
              ? unknownArgs
                ? {
                    kind: 'outcome' as const,
                    outcome: toolFailed(unknownArgs, { mutationScope: 'none' }),
                  }
                : await ports.localTools.execute(
                    call.name,
                    ports.tools.parseToolArgs(call.arguments),
                    {
                      runId,
                      signal: input.signal,
                      turnId: call.id,
                      snapshot: providerSnapshot,
                      scope: input.companionScope,
                    },
                  )
              : {
                  kind: 'outcome' as const,
                  outcome: await refuse(call.name),
                }
          if (result.kind !== 'change')
            record(
              call,
              nonChangeResultOutcome(result, call.name, { terminal: false }),
            )
          return { call, verificationFailure, result }
        }),
      )
      const changeItems = items.filter((item) => item.result.kind === 'change')
      const changes = changeItems.flatMap((item) =>
        item.result.kind === 'change' ? [item.result.change] : [],
      )
      assertWorkActive(input.signal)
      const outcomes = await ports.stepExecutor.processBatch(runId, changes, {
        signal: input.signal,
        onOutcome: (outcome, index) =>
          record(
            changeItems[index].call,
            toolOutcomeFromChange(outcome, summarizeOutcome(outcome)),
          ),
      })
      // Early batch refusals also return factual outcomes without entering apply.
      outcomes.forEach((outcome, index) =>
        record(
          changeItems[index].call,
          toolOutcomeFromChange(outcome, summarizeOutcome(outcome)),
        ),
      )
      assertWorkActive(input.signal)
      for (const outcome of outcomes) {
        await ports.runs.recordToolOutcome(runId, outcome, {
          openAppliedNotes: plan.activeStep?.openOutput ?? true,
        })
        emitToolWriteAudit(
          input.onAuditEvent,
          runId,
          outcome.change.tool ?? 'unknown',
          outcome.change.path,
        )
      }
      let outcomeIndex = 0
      const results = items.map((item) => {
        if (item.result.kind !== 'change')
          return nonChangeResultOutcome(item.result, item.call.name, {
            terminal: false,
          })
        const outcome = outcomes[outcomeIndex++]
        const base = toolOutcomeFromChange(outcome, summarizeOutcome(outcome))
        if (item.verificationFailure)
          base.displayText = `${ports.tools.formatVerificationWarning(item.verificationFailure)}\n${base.displayText}`
        return base
      })
      const observed: AgentToolOutcome[] = []
      for (let i = 0; i < results.length; i++)
        observed.push(await repeats.observe(calls[i], results[i]))
      return observed
    },
  }
}
