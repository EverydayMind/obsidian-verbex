import { createCensusSeedExecutor } from './agentCensusExport'
import type { AgentExecutionPorts } from './agentExecutionPorts'
import type { AgentRunExecution } from './AgentRunExecution'
import type { prepareAgentTurnPlan } from './agentTurnPlanning'
import { emitToolWriteAudit } from './agentWriteAudit'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { RejectedChangeNotes } from './context/rejectedChangeNotes'
import { RepeatedToolCalls } from './context/repeatedToolCalls'
import {
  UserRejectedCalls,
  blockedUserRejectedCall,
  hasDuplicateCalls,
} from './context/userRejectedCall'
import type { AgentLoopDeps, AgentToolOutcome } from './core/llm/agentLoop'
import {
  toolFailed,
  toolOutcomeFromChange,
  vaultMutated,
} from './core/llm/toolOutcome'
import { nonChangeResultOutcome } from './core/tools/readOutcome'
import {
  CANONICAL_TOOL_MAP,
  canonicalToolName,
  getToolCatalog,
} from './core/tools/toolDefinitions'
import { resolveToolMetadata } from './core/tools/toolMetadata'
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
import { refusingAiPrivateRead } from './security/aiPrivateRefusal'
import type { ToolCallRequest } from './types/tool-call.types'
import { summarizeOutcome } from './utils/changeOutcome'

type Planning = Awaited<ReturnType<typeof prepareAgentTurnPlan>>
export type Context = {
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
  Pick<AgentLoopDeps, 'executeTool' | 'executeToolBatch' | 'executeHumanSeed'>
> & {
  repeats: RepeatedToolCalls
} {
  const { ports, input, toolsEnabled, workflowRuntime, plan } = ctx
  const runId = input.runId
  const tracker = turnToolTracker(ctx.turnRecord)
  const repeats = new RepeatedToolCalls()
  const rejectedCalls = new UserRejectedCalls()
  const rejectionNotes = new RejectedChangeNotes()
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
    const outcome = refusedTool(name, reason, reexposed)
    if (!reexposed) return outcome
    const category = (
      ports.providerRegistry?.getToolMetadata?.(name) ??
      resolveToolMetadata(canonicalToolName(name))
    )?.category
    return category === 'write' || category === 'move' || category === 'delete'
      ? { ...outcome, notApplied: 'not_executed' as const }
      : outcome
  }
  const record = (call: ToolCallRequest, outcome: AgentToolOutcome) => {
    rejectedCalls.note(call, outcome)
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
    if (rejectedCalls.blocked(call))
      return record(call, blockedUserRejectedCall())
    const outcome = await tracker.execute(
      call,
      () =>
        refusingAiPrivateRead(() =>
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
            rejectionNotes,
          ),
        ),
      ctx.isPrivateTool(call.name),
    )
    rejectedCalls.note(call, outcome)
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
    executeHumanSeed: createCensusSeedExecutor(ctx, tracker, record, refuse),
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
        hasDuplicateCalls(calls) ||
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
        return toolBatches.observeSequentialResults(
          calls,
          results,
          repeats,
          input.signal,
        )
      }
      const items = await Promise.all(
        calls.map(async (call) => {
          assertWorkActive(input.signal)
          if (rejectedCalls.blocked(call))
            return rejectedCalls.batchItem(call, record)
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
      const recordBatch = rejectionNotes.batchObserver((outcome, index) =>
        record(
          changeItems[index].call,
          toolOutcomeFromChange(outcome, summarizeOutcome(outcome)),
        ),
      )
      const outcomes = await ports.stepExecutor.processBatch(
        runId,
        rejectionNotes.annotateChanges(changes),
        {
          signal: input.signal,
          onOutcome: recordBatch,
        },
      )
      // Early batch refusals also return factual outcomes without entering apply.
      outcomes.forEach(recordBatch)
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
