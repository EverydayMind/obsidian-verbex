import {
  appliedMutationFact,
  mutationFact,
} from '../../context/repeatedToolCalls'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { RequestMessage } from '../../types/llm/request'
import { ResponseUsage, ToolCall } from '../../types/llm/response'
import { ToolCallRequest } from '../../types/tool-call.types'
import type { ExecutionExecutor } from '../batch/contextPacker'
import type { CoverageLedger } from '../routing/coverage'
import { toolArgsValid } from '../tools/parseToolArgs'
import { CANONICAL_TOOL_MAP, TOOL_REGISTRY } from '../tools/toolDefinitions'

import {
  claimsMutationSuccess,
  emptyEvidenceProgress,
  evidenceLedger,
  findSingleMentionedToolName,
  looksLikeNoToolExecutionClaim,
  mutationTargetKey,
  normalizeEvidencePath,
  recordEvidenceProgress,
  reportsMutationFailure,
} from './agentLoopEvidence'
import {
  INVALID_NO_TOOL_RESPONSE_MESSAGE,
  ITERATION_BUDGET_MESSAGE,
  NO_TOOL_EXECUTION_CLAIM_CORRECTION,
  VERIFICATION_FAILED_MESSAGE,
} from './agentLoopNotices'
import {
  assistantProtocolMessage,
  beginAgentTranscript,
  incompleteAgentResult,
  mergeDirectedArguments,
  recordUnexecutedCalls,
} from './agentProtocol'
import { ChatStepResult } from './chatStep'
import {
  type MutationLogEntry,
  laterAppliedMutationCount,
  mutationCallTarget,
  unreportedMutationFailureFacts,
} from './mutationFailureFacts'
import {
  publicToolCall,
  publicToolOutcome,
  publishToolResult,
  toolResultMessage,
} from './privateToolTranscript'
import { publicAgentMessages } from './responsesReplay'
import {
  type AgentToolOutcome,
  recordMutationResult,
  vaultMutated,
} from './toolOutcome'

/**
 * Agentic tool-calling loop (PRD §13). The model is given the Local Tool set
 * and, on each turn, may emit `tool_use` calls. Each call is executed (read
 * tools return text; mutating tools go through the Diff / checkpoint / approval
 * pipeline) and the result is fed back as a `tool` message until the model
 * stops calling tools or the iteration budget is exhausted.
 *
 * The completion call and tool execution are injected so the loop is
 * deterministic and unit-tested without a live provider.
 */

export type { AgentToolOutcome }

export type AgentToolExecutionResult = AgentToolOutcome

export type AgentToolExecutor = (
  call: ToolCallRequest,
) => Promise<AgentToolExecutionResult>

export type MutationResultStatus =
  | 'applied'
  | 'partial'
  | 'rejected'
  | 'failed'
  | 'unknown'

export type AgentCompletionDirective = {
  /** Expose only this tool on the next completion. */
  selectedToolName?: string
  /** Require a native tool call instead of allowing a text-only response. */
  requireToolCall?: boolean
  /**
   * Primitive arguments deterministically merged over the directed tool
   * call's own arguments before execution (the model does not need to echo
   * them back verbatim).
   */
  requiredArguments?: Record<string, string | number | boolean | null>
}

export type AgentLoopStatus =
  | { type: 'llm_request'; iteration: number }
  | { type: 'tool_start'; toolName: string; args: string; iteration: number }
  | {
      type: 'large_file_progress'
      operation: 'analysis' | 'transform'
      phase: 'mapping' | 'reducing' | 'verifying' | 'transforming'
      path: string
      index: number
      total: number
    }

export type AgentLoopDeps = {
  seedToolCalls?: ToolCallRequest[]
  repeatedToolSummary?: () =>
    | import('../../context/repeatedToolCalls').RepeatedToolSummary
    | undefined
  isPrivateTool?: (name: string) => boolean
  onToolOutcome?: (outcome: AgentToolOutcome) => void
  complete: (
    messages: RequestMessage[],
    directive?: AgentCompletionDirective,
  ) => Promise<ChatStepResult>
  executeTool: AgentToolExecutor
  /** Optional first-turn tool routing for deterministic server-side workflows. */
  initialDirective?: AgentCompletionDirective
  /** Tool names that may be selected from malformed prose/JSON responses. */
  availableToolNames?: readonly string[]
  /**
   * Tools that are steps of a host-tracked multi-step job. A text-only
   * answer that names one of them does not tell which step comes next, so
   * the correction retry requires a tool call without narrowing to it.
   */
  jobStepToolNames?: readonly string[]
  /** Immutable workflow objective used by completion guards across local rework turns. */
  workflowGoal?: string
  /** Optional override or indicator that the current workflow step behaves as a mutating task. */
  workflowIsMutating?: boolean
  /**
   * Executes all of a turn's tool calls together, returning one result per call
   * in order. When set and a turn has more than one call, this is used so the
   * mutating calls can be reviewed in a single multi-file Diff. Falls back to
   * {@link executeTool} per call otherwise.
   */
  executeToolBatch?: (
    calls: ToolCallRequest[],
  ) => Promise<AgentToolExecutionResult[]>
  /** Reduce newly read pages before their first transmission, never replay Items. */
  prepareToolResults?: (
    results: AgentToolOutcome[],
  ) => Promise<AgentToolOutcome[]>
  maxIterations?: number
  /**
   * Deprecated Phase-2 no-op. Evidence coverage is now a caller/reporting
   * concern, not a prose-completion guard inside the agent loop.
   */
  minEvidenceReads?: number
  /** Notified after each tool call resolves (for logs / status). */
  onToolResult?: (
    call: ToolCallRequest,
    result: string,
    outcome?: AgentToolOutcome,
  ) => void
  /** Optionally constrain the completion immediately following a tool result. */
  nextDirectiveAfterToolResult?: (
    call: ToolCallRequest,
    result: string,
  ) => AgentCompletionDirective | undefined
  /** Notified when the loop transitions between LLM and tool execution states. */
  onStatusChange?: (status: AgentLoopStatus) => void
  /**
   * Optionally compacts the accumulated agent transcript before each LLM call.
   * This lets small-context runs fold older turns into a summary while keeping
   * the latest tool-call exchange verbatim.
   */
  compactMessages?: (
    messages: RequestMessage[],
    context?: { protectedRecentToolCallIds: Set<string> },
  ) => Promise<{
    messages: RequestMessage[]
    compactedCount: number
    summary: string | null
  }>
  /** Final hard-budget fitting after compaction and before every completion. */
  preflightMessages?: (messages: RequestMessage[]) => Promise<{
    messages: RequestMessage[]
    truncatedToolResults: number
    reducedOlderMessages: number
  }>
  /** Notified when transcript compaction actually folded older messages. */
  onCompaction?: (result: { compactedCount: number; summary: string }) => void
  /** Optional controller-owned mechanical check for a text-only final answer. */
  validateFinalOutput?: (text: string) => string | null
  /** 최종 출력 검증이 재시도 한도까지 실패했을 때, 그대로 수용할지 사용자에게 묻는다.
   *  true를 반환하면 실패 처리하지 않고 현재 텍스트를 최종 결과로 채택한다. */
  confirmValidationOverride?: (info: {
    failureMessage: string
    attempt: number
    reason: 'validation_failed' | 'identical_repeat' | 'max_iterations'
  }) => Promise<boolean>
  /**
   * Prefix used when a provider omits native tool_call ids. Without a run-local
   * prefix, every completion can create `call_0`, colliding with prior history.
   */
  toolCallIdPrefix?: string
}

export type AgentLoopResult = {
  mutations: { tool: string; target?: string; status: string }[]
  repeatedTool?: import('../../context/repeatedToolCalls').RepeatedToolSummary
  messages: RequestMessage[]
  finalText: string
  iterations: number
  toolCalls: ToolCallRequest[]
  stoppedReason:
    | 'completed'
    | 'max_iterations'
    | 'failed'
    | 'paused'
    | 'degenerate_repetition'
  failureReason?:
    | 'invalid_no_tool_response'
    | 'iteration_budget'
    | 'verification_failed'
    | 'mutation_failure_unreported'
  evidence: {
    discoveredPaths: string[]
    inspectedPaths: string[]
  }
  /** Mechanical coverage facts produced by a batch executor, when present. */
  coverage?: CoverageLedger
  /** Deterministic executor selected by the harness for this result. */
  executor?: ExecutionExecutor
  validationOverridden?: boolean
  documentReadSummary?: string[]
  /** Aggregate completion usage for the whole agent run. */
  usage?: ResponseUsage & {
    completion_calls: number
    estimated: boolean
  }
}

const DEFAULT_MAX_ITERATIONS = 16

/** IDs from the latest assistant tool-call batch. Older reads may be evicted,
 * but this batch must survive the next completion. */
export function recentToolCallBatchIds(
  messages: RequestMessage[],
): Set<string> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.tool_calls?.length) continue
    return new Set(message.tool_calls.map((call) => call.id))
  }
  return new Set()
}
const MAX_IDENTICAL_VERIFICATION_FAILURES = 2

export const MUTATION_TOOL_NAMES = new Set([
  ...Object.entries(TOOL_REGISTRY)
    .filter(
      ([_, entry]) =>
        entry.category === 'write' ||
        entry.category === 'delete' ||
        entry.category === 'move',
    )
    .map(([name]) => name),
  'build_treaty_wiki',
  'submit_wiki_finding',
  'verify_wiki_links',
  'compile_wiki_report',
])

async function sequential(
  calls: ToolCallRequest[],
  executeTool: AgentToolExecutor,
): Promise<AgentToolExecutionResult[]> {
  const results: AgentToolExecutionResult[] = []
  for (const call of calls) {
    results.push(await executeTool(call))
  }
  return results
}

function toToolCallRequest(
  call: ToolCall,
  fallbackId: string,
): ToolCallRequest {
  return {
    id: call.id ?? fallbackId,
    name: call.function.name,
    arguments: call.function.arguments,
  }
}

export async function runAgentLoop(
  initialMessages: RequestMessage[],
  deps: AgentLoopDeps,
): Promise<AgentLoopResult> {
  const paths = new Set<string>()
  let unknown = false
  let pathMissing = false
  const mutations: AgentLoopResult['mutations'] = []
  const result = await runAgentLoopInternal(
    initialMessages,
    {
      ...deps,
      onToolOutcome: (outcome) => {
        if (vaultMutated(outcome)) {
          if (outcome.changedPath) paths.add(outcome.changedPath)
          else pathMissing = true
        }
        if (
          outcome.mutation === 'unknown' &&
          (outcome.mutationScope === undefined ||
            outcome.mutationScope === 'vault')
        )
          unknown = true
        deps.onToolOutcome?.(outcome)
      },
    },
    mutations,
  )
  const repeatedTool = deps.repeatedToolSummary?.()
  return {
    ...result,
    mutations,
    ...(result.stoppedReason === 'degenerate_repetition'
      ? {
          finalText: `${result.finalText}\n${appliedMutationFact(paths, unknown, pathMissing)}`,
        }
      : {}),
    ...(repeatedTool ? { repeatedTool } : {}),
    ...(repeatedTool && result.stoppedReason === 'max_iterations'
      ? {
          finalText: L({
            ko: `${result.failureReason === 'iteration_budget' ? '자동 반복 한도에 도달하여 작업을 완료하지 못했습니다.' : result.finalText} ${repeatedTool.name} 도구를 같은 인자로 ${repeatedTool.count}회 호출했습니다. ${mutationFact(repeatedTool)} 요청을 나누거나 필요한 값·범위를 직접 알려 주세요.`,
            en: `${result.failureReason === 'iteration_budget' ? 'The task could not be completed within the automatic iteration limit.' : result.finalText} The ${repeatedTool.name} tool was called ${repeatedTool.count} times with the same arguments. ${mutationFact(repeatedTool)} Split the request or provide the required values/scope directly.`,
          }),
        }
      : {}),
    messages: publicAgentMessages(result.messages, deps.isPrivateTool),
  }
}

async function runAgentLoopInternal(
  initialMessages: RequestMessage[],
  deps: AgentLoopDeps,
  mutations: AgentLoopResult['mutations'],
): Promise<Omit<AgentLoopResult, 'mutations'>> {
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const messages = beginAgentTranscript(initialMessages)
  const executedCalls: ToolCallRequest[] = []
  const evidenceProgress = emptyEvidenceProgress()
  const verificationFailures = new Map<string, number>()
  let fallbackToolCallSeq = 0
  let finalText = ''
  const mutationProgress = new Map<
    string,
    {
      status: MutationResultStatus
      text: string
    }
  >()
  let noToolExecutionClaimCorrected = false
  let answerBeforeFailureCorrection: string | undefined
  const mutationLog: MutationLogEntry[] = []
  let nextCompletionDirective: AgentCompletionDirective | undefined =
    deps.initialDirective

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const seed = iteration === 1 ? deps.seedToolCalls : undefined
    if (!seed?.length && deps.compactMessages) {
      const compacted = await deps.compactMessages(messages, {
        protectedRecentToolCallIds: recentToolCallBatchIds(messages),
      })
      if (compacted.messages !== messages) {
        messages.splice(0, messages.length, ...compacted.messages)
      }
      if (compacted.compactedCount > 0 && compacted.summary) {
        deps.onCompaction?.({
          compactedCount: compacted.compactedCount,
          summary: compacted.summary,
        })
      }
    }

    if (!seed?.length && deps.preflightMessages) {
      const preflight = await deps.preflightMessages(messages)
      if (preflight.messages !== messages) {
        messages.splice(0, messages.length, ...preflight.messages)
      }
    }

    if (!seed?.length) deps.onStatusChange?.({ type: 'llm_request', iteration })
    const directive = seed?.length ? undefined : nextCompletionDirective
    if (!seed?.length) nextCompletionDirective = undefined
    const result: ChatStepResult = seed?.length
      ? {
          modelId: '',
          text: '',
          reasoning: null,
          finishReason: 'tool_calls',
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          usageEstimated: false,
          warnings: [],
          toolCalls: seed.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        }
      : await deps.complete(messages, directive)
    finalText = result.text

    const directedToolName = directive?.selectedToolName
    const invalidDirectedCalls = directedToolName
      ? result.toolCalls.filter((call) => {
          const canonicalCallName =
            CANONICAL_TOOL_MAP[call.function.name] ?? call.function.name
          const canonicalDirectedName =
            CANONICAL_TOOL_MAP[directedToolName] ?? directedToolName
          return canonicalCallName !== canonicalDirectedName
        })
      : []
    if (invalidDirectedCalls.length > 0 && directedToolName) {
      recordUnexecutedCalls(messages, result)
      if (iteration >= maxIterations) {
        return {
          messages,
          finalText: INVALID_NO_TOOL_RESPONSE_MESSAGE(),
          iterations: iteration,
          toolCalls: executedCalls,
          stoppedReason: 'max_iterations',
          failureReason: 'invalid_no_tool_response',
          evidence: evidenceLedger(evidenceProgress),
        }
      }
      nextCompletionDirective = {
        selectedToolName: directedToolName,
        requireToolCall: directive?.requireToolCall,
        requiredArguments: directive?.requiredArguments,
      }
      messages.push({
        role: 'user',
        content: L({
          ko: `${modelMarker('systemNotice', 'ko')} 이번 교정 턴에는 ${directedToolName} 도구만 제공되었습니다. 제공되지 않은 ${[
            ...new Set(invalidDirectedCalls.map((call) => call.function.name)),
          ].join(
            ', ',
          )} 호출은 실행되지 않았습니다. 반드시 ${directedToolName}만 native tool_call로 호출하세요.`,
          en: `${modelMarker('systemNotice', 'en')} Only ${directedToolName} was provided for this corrective turn. Calls to unavailable tools ${[...new Set(invalidDirectedCalls.map((call) => call.function.name))].join(', ')} were not executed. Call only ${directedToolName} using a native tool_call.`,
        }),
      })
      continue
    }

    const fallbackPrefix = deps.toolCallIdPrefix
      ? `${deps.toolCallIdPrefix}:`
      : 'run:'
    const toolCalls = result.toolCalls.map((call) =>
      toToolCallRequest(call, `${fallbackPrefix}call_${fallbackToolCallSeq++}`),
    )
    messages.push(assistantProtocolMessage(result, toolCalls))
    const incomplete = incompleteAgentResult(
      result,
      messages,
      executedCalls,
      iteration,
      evidenceLedger(evidenceProgress),
    )
    if (incomplete) return incomplete

    if (directive?.requireToolCall && toolCalls.length === 0) {
      if (iteration >= maxIterations) {
        return {
          messages,
          finalText: INVALID_NO_TOOL_RESPONSE_MESSAGE(),
          iterations: iteration,
          toolCalls: executedCalls,
          stoppedReason: noToolExecutionClaimCorrected
            ? 'failed'
            : 'max_iterations',
          failureReason: 'invalid_no_tool_response',
          evidence: evidenceLedger(evidenceProgress),
        }
      }
      nextCompletionDirective = directive
      messages.push({
        role: 'user',
        content: L({
          ko: `${modelMarker('systemNotice', 'ko')} 이번 턴은 실제 도구 호출이 필수였지만 tool_call이 없었습니다. 제공된 단일 도구를 native tool_call로 호출하세요.`,
          en: `${modelMarker('systemNotice', 'en')} This turn required an actual tool call, but no tool_call was returned. Call the single provided tool using a native tool_call.`,
        }),
      })
      continue
    }

    if (directive?.requiredArguments && toolCalls.length > 0) {
      // The harness already knows the exact arguments this directed call must
      // use, so merge them in deterministically instead of rejecting the call
      // and round-tripping a correction turn through the model — small models
      // routinely drop or reorder echoed arguments.
      mergeDirectedArguments(toolCalls, directive.requiredArguments)
    }

    if (toolCalls.length === 0) {
      const failedMutations = [...mutationProgress.entries()].filter(
        ([, entry]) =>
          entry.status === 'rejected' ||
          entry.status === 'failed' ||
          entry.status === 'partial',
      )
      const hasSuccessfulMutation = [...mutationProgress.values()].some(
        (entry) => entry.status === 'applied' || entry.status === 'partial',
      )
      if (failedMutations.length > 0) {
        if (
          !claimsMutationSuccess(result.text) &&
          reportsMutationFailure(result.text)
        ) {
          return {
            messages,
            finalText,
            iterations: iteration,
            toolCalls: executedCalls,
            stoppedReason: 'completed',
            evidence: evidenceLedger(evidenceProgress),
          }
        }
        // One correction request; after that the answer is kept as written
        // and the host appends the ledger facts (DECISIONS §4 A13).
        const unresolved = failedMutations
          .map(([key, entry]) => ({
            entry,
            at: mutationLog.map((item) => item.key).lastIndexOf(key),
          }))
          .filter(({ at }) => laterAppliedMutationCount(mutationLog, at) === 0)
          .sort((a, b) => a.at - b.at)
        const latestFailure = unresolved.at(-1)?.entry
        if (
          answerBeforeFailureCorrection !== undefined ||
          iteration >= maxIterations ||
          !latestFailure
        ) {
          return {
            messages,
            finalText: [
              result.text.trim() || answerBeforeFailureCorrection?.trim(),
              unreportedMutationFailureFacts(mutationProgress, mutationLog),
            ]
              .filter(Boolean)
              .join('\n\n'),
            iterations: iteration,
            toolCalls: executedCalls,
            stoppedReason: 'completed',
            evidence: evidenceLedger(evidenceProgress),
          }
        }
        answerBeforeFailureCorrection = result.text
        messages.push({
          role: 'user',
          content: [
            L({
              ko: `${modelMarker('systemNotice', 'ko')} 완료되지 않은 도구 호출의 실제 결과는 다음과 같습니다: ${latestFailure.text}`,
              en: `${modelMarker('systemNotice', 'en')} The actual result of the incomplete tool call is: ${latestFailure.text}`,
            }),
            hasSuccessfulMutation
              ? L({
                  ko: '일부 변경만 성공했습니다. 전체 성공이라고 말하지 말고, 적용된 변경과 거부/실패한 변경을 구분하여 답변에 명확히 보고하십시오.',
                  en: `Only some changes succeeded. Do not claim full success; clearly distinguish applied changes from rejected/failed changes in your answer.`,
                })
              : L({
                  ko: '해당 호출의 거절/실패를 성공으로 보고하지 마십시오. 이후 성공한 호출이 있다면 구분해서 보고하십시오. 실패만으로 파일 변경 여부를 단정하지 말고 실제 도구 결과가 확인한 상태만 답하십시오.',
                  en: `Do not report this rejected/failed call as a success. Report any later successful calls separately. Do not infer file state from failure alone; report only the state confirmed by actual tool results.`,
                }),
            L({
              ko: '이 안내에 대한 답만 쓰지 말고, 사용자의 원래 요청에 대한 최종 답변 전체를 위 사실에 맞게 다시 작성하십시오.',
              en: `Do not reply only to this notice; rewrite your complete final answer to the user's original request so that it is consistent with these facts.`,
            }),
          ].join('\n'),
        })
        continue
      }
      if (
        executedCalls.length === 0 &&
        looksLikeNoToolExecutionClaim(
          result.text,
          deps.availableToolNames ?? [],
        )
      ) {
        if (noToolExecutionClaimCorrected || iteration >= maxIterations) {
          return {
            messages,
            finalText: INVALID_NO_TOOL_RESPONSE_MESSAGE(),
            iterations: iteration,
            toolCalls: executedCalls,
            stoppedReason: noToolExecutionClaimCorrected
              ? 'failed'
              : 'max_iterations',
            failureReason: 'invalid_no_tool_response',
            evidence: evidenceLedger(evidenceProgress),
          }
        }
        noToolExecutionClaimCorrected = true
        const mentionedToolName = findSingleMentionedToolName(
          result.text,
          deps.availableToolNames ?? [],
        )
        const selectedToolName =
          mentionedToolName &&
          deps.jobStepToolNames?.includes(mentionedToolName)
            ? undefined
            : mentionedToolName
        nextCompletionDirective = {
          ...(selectedToolName ? { selectedToolName } : {}),
          requireToolCall: true,
        }
        messages.push({
          role: 'user',
          content: NO_TOOL_EXECUTION_CLAIM_CORRECTION(),
        })
        continue
      }
      const finalOutputFailure = deps.validateFinalOutput?.(result.text) ?? null
      if (finalOutputFailure) {
        const accepted = await deps.confirmValidationOverride?.({
          failureMessage: finalOutputFailure,
          attempt: 1,
          reason: 'validation_failed',
        })
        if (accepted) {
          return {
            messages,
            finalText: L({
              ko: `[검증 예외 수용]\n${finalText}`,
              en: `[Validation exception accepted]\n${finalText}`,
            }),
            iterations: iteration,
            toolCalls: executedCalls,
            stoppedReason: 'completed',
            validationOverridden: true,
            evidence: evidenceLedger(evidenceProgress),
          }
        }
        return {
          messages,
          finalText: [
            VERIFICATION_FAILED_MESSAGE(),
            '',
            finalOutputFailure,
            '',
            L({ ko: '[모델 출력]', en: `[Model output]` }),
            finalText,
          ].join('\n'),
          iterations: iteration,
          toolCalls: executedCalls,
          stoppedReason: 'failed',
          failureReason: 'verification_failed',
          evidence: evidenceLedger(evidenceProgress),
        }
      }
      return {
        messages,
        finalText,
        iterations: iteration,
        toolCalls: executedCalls,
        stoppedReason: 'completed',
        evidence: evidenceLedger(evidenceProgress),
      }
    }

    toolCalls.forEach((call) => {
      deps.onStatusChange?.({
        type: 'tool_start',
        toolName: call.name,
        args: deps.isPrivateTool?.(call.name) ? '{}' : (call.arguments ?? ''),
        iteration,
      })
    })

    let results =
      (toolCalls.length > 1 || Boolean(seed?.length)) && deps.executeToolBatch
        ? await deps.executeToolBatch(toolCalls)
        : await sequential(toolCalls, deps.executeTool)

    if (deps.prepareToolResults)
      results = await deps.prepareToolResults(results)

    let repeatedVerificationFailure: string | null = null
    let pausedToolResult: string | null = null
    toolCalls.forEach((call, callIndex) => {
      const executionResult = results[callIndex] ?? {
        status: 'failed' as const,
        terminal: true,
        mutation: 'none' as const,
        displayText: L({
          ko: '(오류: 도구 실행 결과가 없습니다.)',
          en: `(Error: no tool execution result.)`,
        }),
      }
      if (deps.isPrivateTool?.(call.name))
        executionResult.privateTranscript = true
      deps.onToolOutcome?.(publicToolOutcome(executionResult))
      const toolResult = executionResult.displayText
      executedCalls.push(publicToolCall(call, executionResult))
      if (
        executionResult.status === 'succeeded' &&
        executionResult.evidence &&
        !executionResult.privateTranscript
      ) {
        const { role, paths } = executionResult.evidence
        for (const path of paths) {
          if (role === 'discovery')
            evidenceProgress.discoveredPaths.set(
              normalizeEvidencePath(path),
              path,
            )
          if (role === 'reading')
            evidenceProgress.inspectedPaths.set(
              normalizeEvidencePath(path),
              path,
            )
        }
        if (role === 'discovery')
          evidenceProgress.latestDiscoveryPaths = new Set(
            paths.map(normalizeEvidencePath),
          )
      } else if (
        executionResult.status === 'succeeded' &&
        !executionResult.privateTranscript
      )
        recordEvidenceProgress(evidenceProgress, call, toolResult)
      const mutationStatus: MutationResultStatus =
        executionResult.mutation === 'partial'
          ? 'partial'
          : executionResult.status === 'failed'
            ? 'failed'
            : executionResult.status === 'rejected'
              ? 'rejected'
              : executionResult.mutation === 'applied'
                ? 'applied'
                : 'unknown'
      if (executionResult.status === 'paused') {
        pausedToolResult = publicToolOutcome(executionResult).displayText
      }
      recordMutationResult(
        mutationProgress,
        publicToolOutcome(executionResult),
        mutationTargetKey(call),
        mutationStatus,
      )
      if (executionResult.mutationScope !== 'none')
        mutationLog.push({
          key: executionResult.mutationKey ?? mutationTargetKey(call),
          tool: call.name,
          target: mutationCallTarget(call),
          status: mutationStatus,
        })
      if (executionResult.mutationScope !== 'none')
        mutations.push({
          tool: call.name,
          ...(!executionResult.privateTranscript &&
          executionResult.mutationScope !== 'browser'
            ? { target: mutationCallTarget(call) }
            : {}),
          status: mutationStatus,
        })
      publishToolResult(deps.onToolResult, call, executionResult)
      const args = call.arguments ?? ''
      const argsValid = toolArgsValid(args)
      const modelResult =
        !argsValid && executionResult.status === 'failed'
          ? {
              ...executionResult,
              displayText: L({
                ko: `${executionResult.displayText}\n${modelMarker('harnessFact', 'ko')} 받은 인자가 올바른 JSON 객체가 아니어서(${args.length}자, 끝: "${args.slice(-40)}") 빈 인자로 실행했다. 내용이 길면 나눠서 다시 호출하라.`,
                en: `${executionResult.displayText}\n${modelMarker('harnessFact', 'en')} The received arguments were not a valid JSON object (${args.length} characters, tail: "${args.slice(-40)}"), so the tool ran with empty arguments. Split long content across calls.`,
              }),
            }
          : executionResult
      messages.push(toolResultMessage(call, modelResult))
      const followUpDirective = deps.nextDirectiveAfterToolResult?.(
        call,
        toolResult,
      )
      if (followUpDirective) nextCompletionDirective = followUpDirective
      const signature =
        executionResult.verification?.ok === false
          ? (executionResult.verification.ruleSignature ??
            executionResult.verification.message ??
            call.name)
          : null
      if (signature) {
        const count = (verificationFailures.get(signature) ?? 0) + 1
        verificationFailures.set(signature, count)
        if (count >= MAX_IDENTICAL_VERIFICATION_FAILURES) {
          repeatedVerificationFailure = signature
        } else if (executionResult.retry?.allowed !== false) {
          nextCompletionDirective = {
            selectedToolName: call.name,
            requireToolCall: true,
          }
        }
      }
    })
    if (pausedToolResult) {
      return {
        messages,
        finalText: pausedToolResult,
        iterations: iteration,
        toolCalls: executedCalls,
        stoppedReason: 'paused',
        evidence: evidenceLedger(evidenceProgress),
      }
    }
    if (repeatedVerificationFailure) {
      return {
        messages,
        finalText: VERIFICATION_FAILED_MESSAGE(),
        iterations: iteration,
        toolCalls: executedCalls,
        stoppedReason: 'failed',
        failureReason: 'verification_failed',
        evidence: evidenceLedger(evidenceProgress),
      }
    }
  }

  return {
    messages,
    finalText: ITERATION_BUDGET_MESSAGE(),
    iterations: maxIterations,
    toolCalls: executedCalls,
    stoppedReason: 'max_iterations',
    failureReason: 'iteration_budget',
    evidence: evidenceLedger(evidenceProgress),
  }
}
