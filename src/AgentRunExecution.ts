import { Notice, TFile } from 'obsidian'

import { prepareAgentCompletion } from './agentCompletionRequest'
import type { AgentExecutionPorts } from './agentExecutionPorts'
import { assembleAgentContext } from './agentRequestContext'
import {
  initialAgentDirective,
  prepareAgentRequestPlan,
} from './agentRequestPlan'
import { finalizeAgentResult } from './agentResultFinalization'
import { missingTreatyIndexFolder } from './agentRunErrors'
import { createAgentToolExecution } from './agentToolExecution'
import { emitAgentCompletion } from './audit/agentCompletion'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { emitToolExposure, emitTurnFacts } from './audit/turnFacts'
import { formatVerbexBuildInfo } from './buildInfo'
import { ContextCompactor } from './context/compaction'
import { ContextMode } from './context/contextPolicy'
import { type PriorToolResult } from './context/priorReads'
import {
  EVICTION_TRIGGER_RATIO,
  countRecentBatchReads,
  evictIrrelevantReads,
} from './context/relevanceEviction'
import * as requestIntent from './context/requestIntent'
import { fitMessagesToTokenBudget } from './context/requestPreflight'
import { collapseRedundantToolReads } from './context/toolTranscript'
import { resolveExecutionExecutor } from './core/batch/contextPacker'
import type { BatchContract } from './core/batch/contracts'
import { resolveExecutionRoute } from './core/batch/executionRouter'
import type { AgentRunResult } from './core/census/AgentRunResult'
import { finishRunCensus } from './core/census/finishRunCensus'
import { LargeOperationConfirm } from './core/large-document/LargeDocumentCoordinator'
import { createReadPageDigester } from './core/large-document/readPageDigest'
import {
  AgentLoopDeps,
  AgentLoopStatus,
  runAgentLoop,
} from './core/llm/agentLoop'
import { gatedChatStep } from './core/llm/budgetGate'
import { ChatModelNotReadyError } from './core/llm/ChatModelNotReadyError'
import { MIN_INPUT_BUDGET } from './core/llm/contextWindow'
import type { CoverageFinalNoticeRoute } from './core/llm/coverageFinalNotice'
import { getChatModelClient } from './core/llm/manager'
import {
  checkRunModelReadiness,
  isSelectionReady,
} from './core/llm/modelReadiness'
import { resolveChatModelId } from './core/llm/modelSelection'
import { assertAgentModelApi } from './core/llm/openAIRequestPolicy'
import { withBrowserImages } from './core/llm/toolImages'
import { chatModelSupportsTools } from './core/llm/toolSupport'
import { ToolSupportRequiredError } from './core/llm/ToolSupportRequiredError'
import { emptyAggregateUsage } from './core/llm/usageObserver'
import { WikiTargetConfirm } from './core/review-index/ReviewIndexCoordinator'
import {
  AGENT_WRITE_TOOL_NAMES,
  CANONICAL_TOOL_MAP,
} from './core/tools/toolDefinitions'
import { t } from './i18n'
import { hasModelMarker } from './i18n/modelMarkers'
import type { HwpEditScope } from './provider/contract'
import { BudgetNoticeTracker } from './provider/interop/budgetNotice'
import { DOCUMENT_JOB_TOOL_NAMES } from './provider/interop/documentJobTurnPolicy'
import { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import { createReexposeTool } from './provider/reexposeTool'
import { documentReadSummaries } from './runstate/documentReadFacts'
import { RunArtifactStore } from './runstate/RunArtifactStore'
import {
  TurnRecord,
  beginTurnRecord,
  finishTurnRecord,
} from './runstate/turnLedger'
import { abortedTurnRecord } from './runstate/turnToolTracker'
import { assertWorkActive } from './runtime/PluginRuntimeLifecycle'
import { AuditEvent, ChatWorkflowContextItem } from './types/chat'
import { RequestMessage } from './types/llm/request'
import { Mentionable } from './types/mentionable'
import { PromptLevel } from './types/prompt-level.types'
import { isAbortError } from './utils/llm/retry'
import { tokenCount } from './utils/llm/token'
import { workflowStepRequest } from './workflow/workflowStepRequest'

export { formatCompanionScope } from './provider/companionPrompt'

export function evictionPinnedPaths(
  files: TFile[],
  mentionables: Mentionable[],
): Set<string> {
  return new Set([
    ...files.map((file) => file.path),
    ...mentionables.flatMap((mention) =>
      (mention.type === 'current-file' || mention.type === 'block') &&
      mention.file
        ? [mention.file.path]
        : [],
    ),
  ])
}

export type AgentRunInput = {
  now?: string
  runId: string
  seedToolCalls?: import('./types/tool-call.types').ToolCallRequest[]
  conversationId?: string
  submittedTurnId?: string
  previousSubmittedTurnId?: string
  turnRecord?: TurnRecord
  request: string
  isContinuationSignal?: boolean
  history?: RequestMessage[]
  priorToolResults?: PriorToolResult[]
  priorDocumentPaths?: string[]
  currentFile?: TFile | null
  mentionables?: Mentionable[]
  companionScope?: HwpEditScope
  browserContext?: import('./provider/interop/browserContext').BrowserTurnContext
  pinnedConnectorTools?: string[]
  excludedToolNames?: string[]
  skillInstructions?: string | null
  workflowContext?: ChatWorkflowContextItem[]
  contextModeOverride?: ContextMode
  activeSkills?: {
    tools?: string[]
    crossDocument?: boolean
    batch?: BatchContract
  }[]
  maxIterations?: number
  signal?: AbortSignal
  onToolResult?: AgentLoopDeps['onToolResult']
  onStatusChange?: (status: AgentLoopStatus) => void
  onCensusReportStatus?: (active: boolean) => void
  onTextUpdate?: (text: string) => void
  onChatUsage?: (
    usage: import('./core/llm/usageObserver').ChatCallUsage,
  ) => void
  onConfirmLargeOperation?: LargeOperationConfirm
  onConfirmWikiTarget?: WikiTargetConfirm
  onConfirmValidationOverride?: (info: {
    failureMessage: string
    attempt: number
    reason: 'identical_repeat' | 'max_iterations'
  }) => Promise<boolean>
  onAuditEvent?: (event: AuditEvent) => void
}

export class AgentRunExecution {
  private readonly budgetNotices = new BudgetNoticeTracker()
  constructor(private ports: AgentExecutionPorts) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    assertWorkActive(input.signal)
    console.debug(`[Verbex] agent run start: ${formatVerbexBuildInfo()}`)
    const runSettings = this.ports.settings.getSettings() // Pinned for the whole run (§8-5).
    const modelReadiness = checkRunModelReadiness(runSettings)
    if (!isSelectionReady(modelReadiness))
      throw new ChatModelNotReadyError(modelReadiness)
    const resolved = resolveChatModelId({ settings: runSettings })
    const turnRecord = beginTurnRecord(input, resolved.modelId)
    try {
      const { model } = getChatModelClient({
        modelId: resolved.modelId,
        settings: runSettings,
      })
      const toolsEnabled = runSettings.chatOptions.enableTools
      const modelSupportsTools = chatModelSupportsTools({
        settings: runSettings,
        model,
      })
      if (toolsEnabled && !modelSupportsTools)
        throw new ToolSupportRequiredError(model.id)
      assertAgentModelApi(model, toolsEnabled)
      let prepared = await prepareAgentProviderTools(
        this.ports,
        input,
        model.promptLevel === PromptLevel.Simple,
        toolsEnabled,
      )
      const {
        formatSources,
        exposure,
        providerNotes,
        omittedProviders,
        companionScope: providerCompanionScope,
      } = prepared
      const toolMetadata: typeof prepared.toolMetadata = (name) =>
        prepared.toolMetadata(name)
      let currentProviderNotes = providerNotes
      assertWorkActive(input.signal)
      this.budgetNotices.show(
        input.conversationId ?? input.runId,
        omittedProviders ?? [],
        toolsEnabled,
        !!input.signal?.aborted,
        (provider) => new Notice(t('toolBudgetNotice', { provider })),
      )
      if (runSettings.verbex.privacy.auditLogging && exposure.omitted)
        input.onAuditEvent?.({
          timestamp: Date.now(),
          actor: 'system',
          kind: 'context_exclusion',
          turnId: input.runId,
          summary: 'Connector tool exposure bounded',
          details: { omitted: exposure.omitted, tokens: exposure.tokens },
        })
      const currentSnapshot = () =>
        withBrowserImages(prepared.providerSnapshot, model)
      let messageInputBudget = MIN_INPUT_BUDGET
      const {
        modelLimits,
        outputBudget,
        inputBudget,
        history,
        priorHistory,
        mentionedFiles,
        intentRequest,
        activeWorkflowItem,
        workflowRuntime,
        workflowRun,
        plan,
        agentToolDefinitions,
        messageInputBudget: initialMessageBudget,
      } = await prepareAgentRequestPlan(
        this.ports,
        input,
        runSettings,
        model,
        prepared,
      )
      messageInputBudget = initialMessageBudget

      if (runSettings.verbex.debug?.routing) {
        console.debug(
          `[Verbex][routing] Execution plan decided: ${JSON.stringify({
            kind: plan.kind,
            intentRequest: plan.intentRequest,
            scopeDecision: plan.scopeDecision,
          })}`,
        )
      }

      // 1. Direct tool batch 분기 처리
      if (plan.kind === 'direct_tool_batch') {
        const directRoute = resolveExecutionRoute({
          requestedEntryPoint: 'unit_batch',
          executor: resolveExecutionExecutor({
            decision: plan.scopeDecision,
            contract: plan.step.batch,
          }),
        })
        if (directRoute.entryPoint !== 'unit_batch') {
          throw new Error(
            `unexpected direct batch route: ${directRoute.entryPoint}`,
          )
        }
        let wikiFolder = workflowRun
          ? RunArtifactStore.getIndexFolder(workflowRun)
          : null
        if (!wikiFolder && workflowRun) {
          wikiFolder =
            (await this.ports.reviewIndexCoordinator.recoverWikiFolderArtifact(
              workflowRun,
            )) ?? ''
        }
        if (!wikiFolder) {
          throw new Error(missingTreatyIndexFolder())
        }
        const batchResult =
          await this.ports.reviewIndexCoordinator.runUnitBatch({
            runId: input.runId,
            wikiFolder,
            label:
              [plan.workflow.name, plan.step.title]
                .filter(Boolean)
                .join(' · ') || undefined,
            prompt: plan.step.prompt ?? '',
            inputBudget,
            outputBudget,
            autoApply: plan.workflow.autoApply === true,
            batch: plan.step.batch,
            signal: input.signal,
            onTextUpdate: input.onTextUpdate,
          })
        assertWorkActive(input.signal)
        batchResult.executor = directRoute.executor
        emitTurnFacts(
          runSettings.verbex.privacy.auditLogging,
          finishTurnRecord(turnRecord, batchResult, input.runId),
          input.onAuditEvent,
        )
        await this.ports.workflow.persistAgentResult(
          input,
          batchResult,
          plan.workflow,
          workflowRuntime,
        )
        return batchResult
      }

      const {
        initialMessages,
        effectiveBudget,
        contextPolicy,
        digests,
        packedContext,
        selfContainedSourceArgs,
        turns,
        workflowCoverage,
        executionPlan,
        executionRoute,
      } = await assembleAgentContext({
        ports: this.ports,
        input,
        runSettings,
        model,
        toolsEnabled,
        modelSupportsTools,
        mentionedFiles,
        activeWorkflowItem,
        workflowRuntime,
        workflowRun,
        plan,
        agentToolDefinitions,
        messageInputBudget,
        formatSources,
        providerCompanionScope,
        providerNotes,
        turnRecord,
        priorHistory,
        history,
      })
      const runId = input.runId
      // Use the actual model/message budget. Waiting for the global 32K threshold
      // can overflow an 8K local model first, especially because tool schemas are
      // part of every request even though they are not conversation messages.
      const compactor = new ContextCompactor(
        runSettings,
        tokenCount,
        undefined,
        effectiveBudget,
      )

      // F-2: Run-scoped memoization state for evictIrrelevantReads. Resets on
      // every handleRequest so cross-turn decisions are never reused accidentally.
      let lastEvictionSignature: string | undefined
      let lastEvictionDecision: Set<string> | undefined
      let judgeUnavailable = false
      let summarizerUnavailable = false
      const aggregateUsage = emptyAggregateUsage()

      const toolExecution = createAgentToolExecution({
        ports: this.ports,
        input,
        turnRecord,
        toolsEnabled,
        get callableToolNames() {
          return prepared.callableToolNames
        },
        workflowRuntime,
        plan,
        get providerSnapshot() {
          return currentSnapshot()
        },
        reexposeTool: createReexposeTool(
          this.ports,
          input,
          model.promptLevel === PromptLevel.Simple,
          toolsEnabled,
          () => prepared,
          (next) => {
            prepared = next
          },
        ),
        onUnexposedTool: (name) =>
          this.budgetNotices.show(
            input.conversationId ?? input.runId,
            [
              {
                id: `tool:${name}`,
                name:
                  this.ports.providerRegistry?.native
                    ?.getEntries()
                    .find((entry) => entry.name === name)?.tool.title ?? name,
              },
            ],
            toolsEnabled,
            !!input.signal?.aborted,
            (tool) =>
              new Notice(
                t('ui.AgentRunExecution.toolWasNotIncludedInThisRequest', {
                  p0: tool,
                }),
              ),
          ),
        isPrivateTool: (name) => toolMetadata(name)?.privateTranscript === true,
      })

      const coverageFinalNoticeRoute: CoverageFinalNoticeRoute =
        activeWorkflowItem || workflowRuntime || plan.activeWorkflow
          ? 'workflow'
          : executionRoute.entryPoint !== 'agent_loop' ||
              executionRoute.executor !== 'interactive'
            ? 'batch'
            : prepared.documentJobPolicy.expose
              ? 'document_job'
              : 'chat'

      // Keep runSettings pinned for tool execution, too.
      assertWorkActive(input.signal)
      const loopResult = await this.ports.settings.runWithPinnedSettings(
        runSettings,
        () =>
          runAgentLoop(initialMessages, {
            coverageFinalNoticeRoute,
            assertActive: () => assertWorkActive(input.signal),
            onCoverageFinalNoticeAudit: (event) =>
              emitAgentAuditEvent(
                input.onAuditEvent,
                input.runId,
                'coverage_final_notice',
                event.sent
                  ? 'Coverage final notice sent'
                  : `Coverage final notice skipped (${event.skipped ?? 'unknown'})`,
                undefined,
                {
                  sent: event.sent,
                  notices: event.notices,
                  ...(event.skipped ? { skipped: event.skipped } : {}),
                  queries: event.queries,
                  ...(event.fallback ? { fallback: true } : {}),
                },
              ),
            seedToolCalls: input.seedToolCalls,
            executeHumanSeed: toolExecution.executeHumanSeed,
            isPrivateTool: (name) =>
              toolMetadata(name)?.privateTranscript === true,
            complete: async (messages, directive) => {
              assertWorkActive(input.signal)
              if (currentProviderNotes !== prepared.providerNotes) {
                let replaced = false
                for (const message of messages) {
                  if (
                    currentProviderNotes &&
                    typeof message.content === 'string' &&
                    message.content.includes(currentProviderNotes)
                  ) {
                    message.content = message.content.replace(
                      currentProviderNotes,
                      prepared.providerNotes,
                    )
                    replaced = true
                  }
                }
                if (
                  !replaced &&
                  prepared.providerNotes &&
                  typeof messages[0]?.content === 'string'
                )
                  messages[0].content += `\n\n${prepared.providerNotes}`
                currentProviderNotes = prepared.providerNotes
              }
              const {
                request: completionRequest,
                canonicalSelectedName,
                selectedTools,
                messageInputBudget: fittedBudget,
              } = await prepareAgentCompletion({
                input,
                model,
                prepared,
                toolsEnabled,
                intentRequest,
                scopeDecision: plan.scopeDecision,
                messages,
                directive,
                inputBudget,
                outputBudget,
                temperature: modelLimits.temperature,
                onExposure: (tools, definitionTokens) =>
                  emitToolExposure(
                    runSettings.verbex.privacy.auditLogging,
                    turnRecord,
                    tools.map((t) => t.function.name),
                    input.excludedToolNames?.length ?? 0,
                    definitionTokens,
                    input.onAuditEvent,
                  ),
              })
              messageInputBudget = fittedBudget
              const stepResult = await gatedChatStep({
                settings: runSettings,
                diagnosticCallKind: 'agent',
                diagnosticReduced: !!canonicalSelectedName,
                requiredBlocks: completionRequest.messages,
                onWireMessages: currentSnapshot()?.observations?.sent,
                disclosureContext: completionRequest.disclosureContext,
                tools: completionRequest.tools,
                inputBudget: completionRequest.inputBudget,
                maxTokens: completionRequest.maxTokens,
                temperature: completionRequest.temperature,
                ...(completionRequest.toolChoice
                  ? { toolChoice: completionRequest.toolChoice }
                  : {}),
                ...(input.onTextUpdate
                  ? {
                      onTextUpdate: input.onTextUpdate,
                    }
                  : {}),
                options: input.signal ? { signal: input.signal } : undefined,
              })
              this.ports.providerRegistry?.recordExposure?.(
                selectedTools.map((tool) => tool.function.name),
              )
              aggregateUsage.prompt_tokens += stepResult.usage.prompt_tokens
              aggregateUsage.completion_tokens +=
                stepResult.usage.completion_tokens
              aggregateUsage.total_tokens += stepResult.usage.total_tokens
              aggregateUsage.completion_calls += 1
              aggregateUsage.estimated ||= stepResult.usageEstimated
              return stepResult
            },
            get availableToolNames() {
              return toolsEnabled ? [...prepared.callableToolNames] : []
            },
            jobStepToolNames: DOCUMENT_JOB_TOOL_NAMES,
            workflowGoal: workflowRuntime?.workflowGoal,
            workflowIsMutating:
              plan.activeStep?.tool &&
              (AGENT_WRITE_TOOL_NAMES.has(plan.activeStep.tool) ||
                (plan.activeStep.tool === 'llm' &&
                  (Boolean(plan.activeStep.batch) ||
                    Boolean(plan.activeStep.outputPath) ||
                    Boolean(
                      plan.activeStep.verification?.requireChecklistComplete,
                    ))))
                ? true
                : undefined,
            initialDirective: initialAgentDirective({
              toolsEnabled,
              plan,
              workflowRuntime,
              selfContainedSourceArgs,
              contextPolicy,
              input,
              digests,
              packedContext,
              turns,
            }),
            executeTool: toolExecution.executeTool,
            repeatedToolSummary: () => toolExecution.repeats.mostRepeated(),
            prepareToolResults: createReadPageDigester({
              enabled:
                !activeWorkflowItem &&
                plan.scopeDecision.operation === 'analysis' &&
                requestIntent.summary(intentRequest, /요약|summari[sz]/i),
              request: intentRequest,
              input: {
                settings: runSettings,
                inputBudget,
                options: { signal: input.signal },
                disclosureContext: {
                  runId,
                  turnId: prepared.providerTurnId,
                  approvedConnectorVaultRead:
                    prepared.approvedConnectorVaultRead,
                },
              },
              usage: aggregateUsage,
            }),
            nextDirectiveAfterToolResult: (call, toolResult) => {
              const canonicalCallName =
                CANONICAL_TOOL_MAP[call.name] ?? call.name
              const canonicalWorkflowTool = plan.selfContainedWorkflowTool
                ? (CANONICAL_TOOL_MAP[plan.selfContainedWorkflowTool] ??
                  plan.selfContainedWorkflowTool)
                : undefined
              if (
                canonicalWorkflowTool !== 'build_review_index' ||
                canonicalCallName !== 'build_review_index'
              )
                return undefined
              const args = this.ports.tools.parseToolArgs(call.arguments)
              if (
                args.preview !== true ||
                !hasModelMarker(toolResult, 'preview')
              ) {
                return undefined
              }
              const requiredArguments = Object.fromEntries(
                Object.entries(args).filter(
                  (
                    entry,
                  ): entry is [string, string | number | boolean | null] =>
                    entry[1] === null ||
                    typeof entry[1] === 'string' ||
                    typeof entry[1] === 'number' ||
                    typeof entry[1] === 'boolean',
                ),
              )
              // 사용자 확인 결과(폴더·rebuild)를 빌드 인자에 반영하고, 그 인자가
              // 빌드 가드(비어 있지 않은 index_folder)에 걸릴 것이 확실하면 지시를
              // 내리지 않는다 — 강제된 호출이 예정된 실패로 끝나는 것을 막는
              // pre-flight.
              const decision =
                this.ports.reviewIndexCoordinator.getWikiDecision(runId, args)
              const folderVal = args.index_folder ?? args.wiki_folder
              const targetFolder =
                decision?.wikiFolder ??
                (typeof folderVal === 'string' ? folderVal : '')
              const rebuild =
                decision?.mode === 'rebuild' || args.rebuild === true
              if (
                !rebuild &&
                this.ports.reviewIndexCoordinator.probeWikiFolder(targetFolder)
                  .noteCount > 0
              )
                return undefined
              const isLegacyCall = args.wiki_folder !== undefined
              return {
                selectedToolName: 'build_review_index',
                requireToolCall: true,
                requiredArguments: {
                  ...requiredArguments,
                  ...(decision
                    ? isLegacyCall
                      ? { wiki_folder: decision.wikiFolder }
                      : { index_folder: decision.wikiFolder }
                    : {}),
                  ...(rebuild ? { rebuild: true } : {}),
                  preview: false,
                },
              }
            },
            executeToolBatch: toolExecution.executeToolBatch,
            toolCallIdPrefix: input.runId,
            maxIterations: modelLimits.maxIterations,
            minEvidenceReads: runSettings.chatOptions.minEvidenceReads,
            validateFinalOutput:
              workflowRuntime?.activeStepId === 'detailed_review' &&
              workflowCoverage?.sourceText
                ? (text) =>
                    this.ports.workflow.validateCoverageReviewOutput(
                      text,
                      workflowCoverage.sourceText ?? '',
                    )
                : undefined,
            confirmValidationOverride: (() => {
              const activeStep = activeWorkflowItem?.steps?.find(
                (step) => step.id === workflowRuntime?.activeStepId,
              )
              return activeStep?.verification?.allowValidationOverride ===
                true && input.onConfirmValidationOverride
                ? input.onConfirmValidationOverride
                : undefined
            })(),
            // Collapse duplicates, evict irrelevant reads, then compact older turns.
            compactMessages: async (messages, context) => {
              assertWorkActive(input.signal)
              let working = collapseRedundantToolReads(messages, toolMetadata)

              if (runSettings.verbex.context.relevanceEviction) {
                const { estimatedTokens } = await compactor.decide(
                  working as (RequestMessage & { content: string })[],
                )
                const evictionThreshold =
                  effectiveBudget * EVICTION_TRIGGER_RATIO
                if (estimatedTokens >= evictionThreshold && !judgeUnavailable) {
                  // F-5: Count only the reads since the last assistant message
                  // (= the most-recent batch), not the entire history. The original
                  // code counted all history reads, making recentTurnsToPin >= total
                  // reads and therefore pinning every file — eviction was never
                  // triggered.
                  const recentReadCount = countRecentBatchReads(
                    working,
                    toolMetadata,
                  )

                  // P2: Enrich the eviction goal with the active workflow step so
                  // the judge has enough context in bare continuation turns
                  // ("진행하세요") where intentRequest is just that short phrase.
                  const evictionGoal = workflowStepRequest(
                    intentRequest,
                    workflowRuntime?.activeStepId,
                    activeWorkflowItem?.steps,
                  )

                  try {
                    const evicted = await evictIrrelevantReads(
                      working,
                      this.ports.context.relevanceJudge(
                        input,
                        prepared.providerTurnId,
                        prepared.approvedConnectorVaultRead,
                      ),
                      {
                        goal: evictionGoal,
                        pinnedPaths: evictionPinnedPaths(
                          mentionedFiles,
                          input.mentionables ?? [],
                        ),
                        toolMetadata,
                        countTokens: tokenCount,
                        // (6.1) Protect the most-recent reads from eviction to prevent
                        // the Evict-Read loop where a file the agent just read is
                        // immediately judged irrelevant and evicted.
                        // (F-5) Use the actual recent-batch read count (min 3) to
                        // cover large batches where more than 3 files were read.
                        recentTurnsToPin: Math.max(3, recentReadCount),
                        protectedRecentToolCallIds:
                          context?.protectedRecentToolCallIds,
                        // F-2: pass the previous call's fingerprint and decision so
                        // the judge is skipped when the candidate set has not changed.
                        previousSignature: lastEvictionSignature,
                        previousDecision: lastEvictionDecision,
                      },
                    )
                    // F-2: persist only successful judge decisions.
                    lastEvictionSignature = evicted.signature
                    lastEvictionDecision = new Set(evicted.evictedRefs)
                    if (evicted.evictedCount > 0) {
                      working = evicted.messages
                      input.onToolResult?.(
                        {
                          id: 'context_eviction',
                          name: 'context_eviction',
                          arguments: JSON.stringify({
                            evictedCount: evicted.evictedCount,
                          }),
                        },
                        t(
                          'ui.AgentRunExecution.removedFilesConsideredUnrelatedToTheCurrent',
                          { p0: evicted.evictedCount },
                        ),
                      )
                      emitAgentAuditEvent(
                        input.onAuditEvent,
                        input.runId,
                        'context_eviction',
                        'Context items evicted',
                        undefined,
                        { evictedCount: evicted.evictedCount },
                      )
                    }
                  } catch (error) {
                    if (input.signal?.aborted || isAbortError(error))
                      throw error
                    judgeUnavailable = true
                    console.warn(
                      '[Verbex] relevance eviction judge unavailable; skipping for this run',
                      error,
                    )
                  }
                }
              }

              const collapsed = working
              if (!runSettings.verbex.context.autoCompact) {
                return { messages: collapsed, compactedCount: 0, summary: null }
              }
              if (summarizerUnavailable) {
                return { messages: collapsed, compactedCount: 0, summary: null }
              }
              try {
                return await compactor.compactIfNeeded(
                  collapsed as (RequestMessage & { content: string })[],
                  this.ports.context.transcriptSummarizer(
                    input,
                    prepared.providerTurnId,
                    prepared.approvedConnectorVaultRead,
                  ),
                )
              } catch (error) {
                if (input.signal?.aborted || isAbortError(error)) throw error
                summarizerUnavailable = true
                console.warn(
                  '[Verbex] transcript summarizer unavailable; skipping for this run',
                  error,
                )
                return { messages: collapsed, compactedCount: 0, summary: null }
              }
            },
            preflightMessages: (messages) =>
              fitMessagesToTokenBudget(messages, messageInputBudget),
            onToolOutcome: (outcome) => {
              if (
                runSettings.verbex.privacy.auditLogging &&
                outcome.connectorAudit
              )
                input.onAuditEvent?.({
                  timestamp: Date.now(),
                  actor: 'system',
                  kind: 'tool_call',
                  turnId: input.runId,
                  summary: 'Plugin connector call completed',
                  details: { ...outcome.connectorAudit },
                })
            },
            onToolResult: input.onToolResult,
            onStatusChange: input.onStatusChange,
            onCompaction: ({ compactedCount }) => {
              emitAgentAuditEvent(
                input.onAuditEvent,
                input.runId,
                'context_compaction',
                'Conversation context compacted',
                undefined,
                { compactedCount },
              )
              input.onToolResult?.(
                {
                  id: 'context_compaction',
                  name: 'context_compaction',
                  arguments: JSON.stringify({ compactedCount }),
                },
                t(
                  'ui.AgentRunExecution.compactedContextBySummarizingEarlierMessages',
                  { p0: compactedCount },
                ),
              )
            },
          }),
      )
      // §6.5: prefix the single final answer with a small status badge when the
      // turn actually ran a whole-document map-reduce, so the user can see the
      // review scope without the internal chunk/tool events being spelled out.
      assertWorkActive(input.signal)
      const result: AgentRunResult = finalizeAgentResult(
        { ...loopResult, usage: aggregateUsage },
        executionPlan,
        executionRoute.executor,
        input.runId,
        this.ports.largeDocumentCoordinator.formatResultBadge(
          digests,
          plan.scopeDecision,
        ),
      )

      result.censusReport = await finishRunCensus(
        turnRecord,
        input.runId,
        input.signal,
        () =>
          this.ports.localTools.census.buildReport(
            turnRecord,
            input.runId,
            input.signal,
          ),
        input.onCensusReportStatus,
      )
      if (input.signal?.aborted) result.censusReport = undefined
      result.documentReadSummary = documentReadSummaries([turnRecord], 'ui')
      emitTurnFacts(
        runSettings.verbex.privacy.auditLogging,
        finishTurnRecord(turnRecord, result, input.runId),
        input.onAuditEvent,
      )
      await this.ports.workflow.persistAgentResult(
        input,
        result,
        activeWorkflowItem,
        workflowRuntime,
      )
      emitAgentCompletion(input, result)
      return result
    } catch (error) {
      if (
        input.signal?.aborted ||
        isAbortError(error) ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        try {
          await this.ports.runs.persistAbortedTurn(
            input.runId,
            abortedTurnRecord(turnRecord),
          )
        } catch {
          console.warn('[Verbex] aborted turn ledger could not be saved')
        }
      }
      throw error
    }
  }
}
