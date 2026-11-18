import { Notice, TFile } from 'obsidian'

import type { AgentExecutionPorts } from './agentExecutionPorts'
import { finalizeAgentResult } from './agentResultFinalization'
import { missingTreatyIndexFolder } from './agentRunErrors'
import { createAgentToolExecution } from './agentToolExecution'
import { prepareAgentTurnPlan } from './agentTurnPlanning'
import { emitAgentCompletion } from './audit/agentCompletion'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { summarizeContextAudit } from './audit/contextAudit'
import { emitToolExposure, emitTurnFacts } from './audit/turnFacts'
import { formatVerbexBuildInfo } from './buildInfo'
import {
  isBinaryDocumentFile,
  isBlankNote,
  splitAgentHistory,
  withoutWorkflowGuide,
} from './context/agentSourcePolicy'
import { refitBaseContext } from './context/baseContextRefit'
import { ContextCompactor } from './context/compaction'
import { ContextAssembler } from './context/ContextAssembler'
import {
  ContextMode,
  resolveConfiguredContextMode,
  resolveContextPolicy,
} from './context/contextPolicy'
import { addContinuationSections } from './context/continuationFacts'
import { continuationRequiresToolCall } from './context/continuationToolCall'
import { effectiveContextBudget } from './context/effectiveContextBudget'
import { mergeUniqueByPath } from './context/fileCollections'
import { type PriorToolResult, carryPriorReads } from './context/priorReads'
import { measureStaticPromptOverhead } from './context/promptOverhead'
import {
  EVICTION_TRIGGER_RATIO,
  countRecentBatchReads,
  evictIrrelevantReads,
} from './context/relevanceEviction'
import * as requestIntent from './context/requestIntent'
import { fitMessagesToTokenBudget } from './context/requestPreflight'
import { collapseRedundantToolReads } from './context/toolTranscript'
import { requiresContextToolCall } from './context/wholeDigestPolicy'
import {
  resolveExecutionExecutor,
  snapshotExecutionPlan,
} from './core/batch/contextPacker'
import type { BatchContract } from './core/batch/contracts'
import { resolveExecutionRoute } from './core/batch/executionRouter'
import { LargeOperationConfirm } from './core/large-document/LargeDocumentCoordinator'
import { createReadPageDigester } from './core/large-document/readPageDigest'
import {
  AgentLoopDeps,
  AgentLoopResult,
  AgentLoopStatus,
  runAgentLoop,
} from './core/llm/agentLoop'
import { chatMessageBudget, gatedChatStep } from './core/llm/budgetGate'
import { ChatModelNotReadyError } from './core/llm/ChatModelNotReadyError'
import {
  MIN_INPUT_BUDGET,
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from './core/llm/contextWindow'
import { getChatModelClient } from './core/llm/manager'
import {
  checkRunModelReadiness,
  isSelectionReady,
} from './core/llm/modelReadiness'
import {
  resolveAgentModelLimits,
  resolveChatModelId,
} from './core/llm/modelSelection'
import { assertAgentModelApi } from './core/llm/openAIRequestPolicy'
import { withBrowserImages } from './core/llm/toolImages'
import { chatModelSupportsTools } from './core/llm/toolSupport'
import { ToolSupportRequiredError } from './core/llm/ToolSupportRequiredError'
import { emptyAggregateUsage } from './core/llm/usageObserver'
import { WikiTargetConfirm } from './core/review-index/ReviewIndexCoordinator'
import {
  AGENT_CALLABLE_TOOL_NAMES,
  AGENT_WRITE_TOOL_NAMES,
  CANONICAL_TOOL_MAP,
  agentToolRoutingText,
  isChapterFileSplitRequest,
  selectAgentToolDefinitions,
} from './core/tools/toolDefinitions'
import { t } from './i18n'
import { hasModelMarker } from './i18n/modelMarkers'
import { providerTurnContext } from './provider/companionPrompt'
import type { HwpEditScope } from './provider/contract'
import { directiveToolDefinitions } from './provider/directiveToolDefinitions'
import { BudgetNoticeTracker } from './provider/interop/budgetNotice'
import { DOCUMENT_JOB_TOOL_NAMES } from './provider/interop/documentJobTurnPolicy'
import { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import { createReexposeTool } from './provider/reexposeTool'
import { buildContextDelivery } from './runstate/contextDelivery'
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
import { RequestMessage, RequestTool } from './types/llm/request'
import { Mentionable } from './types/mentionable'
import { PromptLevel } from './types/prompt-level.types'
import { formatBytes } from './utils/formatBytes'
import { estimateTokens } from './utils/llm/estimateTokens'
import { isAbortError } from './utils/llm/retry'
import { tokenCount } from './utils/llm/token'
import { AttachmentDigest } from './verbex/types'
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

export class AgentRunExecution {
  private readonly budgetNotices = new BudgetNoticeTracker()
  constructor(private ports: AgentExecutionPorts) {}

  async run(input: {
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
  }): Promise<AgentLoopResult> {
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
      const withProviderTools: typeof prepared.withProviderTools = (tools) =>
        prepared.withProviderTools(tools)
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
      let agentToolDefinitions: RequestTool[] = []
      let messageInputBudget = MIN_INPUT_BUDGET
      const modelLimits = resolveAgentModelLimits(
        model.promptLevel,
        input.maxIterations,
        input.request,
      )
      const contextWindow = resolveContextWindow(model)
      const outputBudget = computeOutputBudget(
        contextWindow,
        runSettings.verbex.context.reservedOutputTokens,
      )
      const inputBudget = computeInputBudget(contextWindow, outputBudget)
      const { history, priorHistory } = splitAgentHistory(
        input.history ?? [],
        input.request,
        await carryPriorReads(input, toolMetadata, runSettings, inputBudget),
      )

      const {
        mentionedFiles,
        intentRequest,
        activeWorkflowItem,
        workflowRuntime,
        workflowRun,
        plan,
      } = await prepareAgentTurnPlan(this.ports, input, history, priorHistory)

      emitAgentAuditEvent(
        input.onAuditEvent,
        input.runId,
        'intent_classification',
        t('ui.AgentRunExecution.agentExecutionPlanPreparedCoverage', {
          p0: plan.kind,
          p1: plan.scopeDecision.coverage,
        }),
      )

      agentToolDefinitions = toolsEnabled
        ? await withProviderTools(
            selectAgentToolDefinitions(
              input.request,
              model.promptLevel,
              input.activeSkills,
              plan.scopeDecision,
            ),
          )
        : []

      const toolDefinitionTokens = await tokenCount(
        JSON.stringify(agentToolDefinitions),
      )
      messageInputBudget = chatMessageBudget(inputBudget, toolDefinitionTokens)

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

      // 2. Agent loop에 대한 컨텍스트 조립 (Context Assembly)
      // plan.kind === 'agent_loop' 상황
      let restoredReviewScope: TFile[] = []
      if (plan.activeWorkflow && !plan.checklistGated) {
        restoredReviewScope = plan.restoredScopePaths.flatMap((path) => {
          if (path === input.currentFile?.path) return []
          const file = this.ports.findFile(path)
          return file ? [file] : []
        })
      }
      // Binary companion documents (HWPX/HWP/PDF/office files) never reach
      // cachedRead, grounding or workflow coverage as text. The large-document
      // port reads only ready disk projections: whole requests may digest them,
      // otherwise ContextBuilder adds bounded, revision-labelled excerpts.
      const textCurrentFile = isBinaryDocumentFile(plan.effectiveCurrentFile)
        ? null
        : plan.effectiveCurrentFile
      const reviewMentionedFiles = mergeUniqueByPath(
        mentionedFiles,
        restoredReviewScope,
      )
      if (plan.currentFileDrifted) {
        console.debug(
          `[Verbex] Drift guard active: ignored unrelated active file "${input.currentFile?.path ?? '(unknown)'}"`,
        )
      }

      // Guidance text (skill & workflow) 빌드
      const scopedWorkflowGuidance =
        plan.activeWorkflow && workflowRuntime
          ? this.ports.workflow.activeWorkflowGuidance(
              plan.activeWorkflow,
              workflowRuntime,
              workflowRun?.artifacts ?? {},
            )
          : null
      const retainedSkillGuidance = withoutWorkflowGuide(
        input.skillInstructions,
      )
      const largeDocumentGuidance = scopedWorkflowGuidance
        ? [retainedSkillGuidance, scopedWorkflowGuidance]
            .filter(Boolean)
            .join('\n\n---\n\n')
        : input.skillInstructions

      const coverageFiles = mergeUniqueByPath(
        textCurrentFile ? [textCurrentFile] : [],
        reviewMentionedFiles.filter((file) => !isBinaryDocumentFile(file)),
      )
      const workflowCoverage =
        workflowRuntime?.activeStepId === 'detailed_review'
          ? await this.ports.workflow.prepareWorkflowCoverage(
              input.runId,
              coverageFiles,
            )
          : null

      // Map-Reduce Digests 생성
      const reallyShouldDigestCurrentNote =
        !workflowCoverage &&
        !plan.checklistGated &&
        Boolean(plan.effectiveCurrentFile) &&
        plan.scopeDecision.coverage === 'whole'

      let currentNoteDigest: AttachmentDigest | null = null
      let currentNoteListOnly: TFile | null = null
      if (reallyShouldDigestCurrentNote && plan.effectiveCurrentFile) {
        const currentResult =
          await this.ports.largeDocumentCoordinator.prepareAttachments(
            plan.intentRequest,
            [plan.effectiveCurrentFile],
            messageInputBudget,
            input.signal,
            input.onToolResult,
            input.onStatusChange,
            input.runId,
            'current_note',
            input.onConfirmLargeOperation,
            largeDocumentGuidance,
            workflowRuntime !== null,
            plan.selfContainedWorkflowTool ?? undefined,
          )
        const digest = currentResult.digests[0]
        if (digest) {
          currentNoteDigest = digest
        }
        currentNoteListOnly = currentResult.listOnlyFiles[0] ?? null
      }

      const attachmentCandidates =
        currentNoteDigest || currentNoteListOnly
          ? reviewMentionedFiles.filter(
              (file) => file.path !== plan.effectiveCurrentFile?.path,
            )
          : reviewMentionedFiles
      const attachmentResult =
        await this.ports.largeDocumentCoordinator.prepareAttachments(
          plan.intentRequest,
          attachmentCandidates,
          messageInputBudget,
          input.signal,
          input.onToolResult,
          input.onStatusChange,
          input.runId,
          'attachment',
          input.onConfirmLargeOperation,
          largeDocumentGuidance,
          workflowRuntime !== null,
          plan.selfContainedWorkflowTool ?? undefined,
        )
      const smallFiles = attachmentResult.smallFiles
      const digests = currentNoteDigest
        ? [currentNoteDigest, ...attachmentResult.digests]
        : attachmentResult.digests
      const listOnlyFiles = currentNoteListOnly
        ? [currentNoteListOnly, ...attachmentResult.listOnlyFiles]
        : attachmentResult.listOnlyFiles

      // System prompt 빌드
      const { prompt: systemPrompt } =
        await this.ports.systemPromptBuilder.build({
          skillInstructions: largeDocumentGuidance,
          currentFilePath: plan.effectiveCurrentFile?.path ?? null,
          promptLevel: model.promptLevel,
          toolsEnabled,
          exposedToolNames: new Set(
            agentToolDefinitions.map((tool) => tool.function.name),
          ),
        })

      // Token budget 계산
      // Tool schemas were already removed from messageInputBudget above. Count
      // only the serialized system/history envelope here so the packet packer
      // and final request preflight share the same boundary without double
      // counting tool definitions.
      const fixedOverheadTokens = await measureStaticPromptOverhead(
        systemPrompt,
        priorHistory,
      )
      // Keep the retrieval/attachment sub-budget conservative. This estimate is
      // intentionally independent from the exact fixed-overhead admission: it
      // prevents context construction from consuming the safety margin later
      // applied by gatedChatStep.
      const framingTokens =
        estimateTokens(systemPrompt) +
        priorHistory.reduce(
          (sum, message) =>
            sum +
            estimateTokens(
              typeof message.content === 'string' ? message.content : '',
            ),
          0,
        ) +
        estimateTokens(input.request) +
        digests.reduce((sum, digest) => sum + estimateTokens(digest.text), 0)
      const effectiveBudget = effectiveContextBudget(
        runSettings,
        messageInputBudget,
      )
      const contextAssemblyBudget = Math.max(
        MIN_INPUT_BUDGET,
        effectiveBudget - framingTokens,
      )

      // ContextBuilder context 획득
      const contextPolicy = resolveContextPolicy({
        configuredMode: resolveConfiguredContextMode(
          runSettings.verbex.context,
        ),
        turnOverride: input.contextModeOverride,
        isFirstTurn: plan.isFirstTurn,
        bareContinuation: plan.bareContinuation,
        toolsEnabled,
        modelSupportsTools,
        activeWorkflow: plan.activeWorkflow !== null,
        selfContainedWorkflowTool: plan.selfContainedWorkflowTool !== null,
        hasExplicitAttachments:
          mentionedFiles.length > 0 || smallFiles.length > 0,
        hasCurrentNoteDigest: currentNoteDigest !== null,
        hasCurrentFile:
          plan.effectiveCurrentFile !== null &&
          !(await isBlankNote(plan.effectiveCurrentFile)),
        scopeDecision: plan.scopeDecision,
      })
      emitAgentAuditEvent(
        input.onAuditEvent,
        input.runId,
        'context_retrieval',
        'Context policy resolved',
        undefined,
        {
          requestedMode: contextPolicy.requestedMode,
          effectiveMode: contextPolicy.effectiveMode,
          policySource: contextPolicy.source,
          policyReason: contextPolicy.reason,
          requireToolCall: contextPolicy.requireToolCall,
        },
      )

      const shouldBuildContext =
        contextPolicy.automaticRetrieval ||
        smallFiles.length > 0 ||
        currentNoteDigest !== null
      const context = shouldBuildContext
        ? await this.ports.context.buildContext(
            plan.intentRequest,
            contextPolicy.effectiveMode === 'off' || currentNoteListOnly
              ? null
              : plan.effectiveCurrentFile,
            smallFiles,
            contextAssemblyBudget,
            currentNoteDigest !== null,
            formatSources,
          )
        : null
      if (context) {
        for (const fact of summarizeContextAudit(context)) {
          emitAgentAuditEvent(
            input.onAuditEvent,
            input.runId,
            fact.kind,
            fact.summary,
            undefined,
            {
              ...fact.details,
              ...(fact.kind === 'context_retrieval'
                ? {
                    estimatedContextTokens: context.estimatedTokens,
                    requestedMode: contextPolicy.requestedMode,
                    effectiveMode: contextPolicy.effectiveMode,
                  }
                : {}),
            },
          )
        }
      }

      // ContextAssembler를 활용해 최종 userContent 조립
      const assembler = new ContextAssembler()
      if (context) {
        const contextContent =
          contextPolicy.effectiveMode === 'catalog'
            ? this.ports.presenter.formatAgentCatalogContext(
                plan.intentRequest,
                context,
                Math.min(
                  runSettings.verbex.context.catalogTokenBudget,
                  contextAssemblyBudget,
                ),
                runSettings.verbex.context.catalogCandidateLimit,
              )
            : contextPolicy.effectiveMode === 'off'
              ? this.ports.presenter.formatAgentExplicitContext(context)
              : this.ports.presenter.formatAgentContext(
                  plan.intentRequest,
                  context,
                )
        if (contextContent) {
          assembler.addSection({
            id: 'base_context',
            content: contextContent,
          })
        }
      }
      if (digests.length > 0) {
        assembler.addSection({
          id: 'digests',
          content: this.ports.largeDocumentCoordinator.formatDigests(digests),
        })
      }
      if (workflowCoverage?.context) {
        assembler.addSection({
          id: 'workflow_coverage',
          content: workflowCoverage.context,
          ...(workflowCoverage.current?.unitId
            ? { coverageUnitIds: [workflowCoverage.current.unitId] }
            : {}),
        })
      }
      if (workflowCoverage?.coveragePacketSeeds?.length) {
        assembler.addPacketSeeds(workflowCoverage.coveragePacketSeeds)
      }
      if (plan.selfContainedWorkflowTool) {
        const sourceInventory =
          this.ports.largeDocumentCoordinator.formatSourceInventory(
            listOnlyFiles,
            plan.selfContainedWorkflowTool,
            formatBytes,
          )
        if (sourceInventory) {
          assembler.addSection({
            id: 'self_contained_inventory',
            content: sourceInventory,
          })
        }
      }

      if (
        !plan.isFirstTurn &&
        context === null &&
        (contextPolicy.effectiveMode !== 'off' ||
          contextPolicy.preserveWorkflowRegrounding)
      ) {
        if (
          plan.activeWorkflow &&
          !plan.selfContainedWorkflowTool &&
          contextPolicy.preserveWorkflowRegrounding
        ) {
          const regrounding =
            await this.ports.presenter.buildWorkflowRegrounding(
              plan.intentRequest,
              textCurrentFile,
              contextAssemblyBudget,
            )
          if (regrounding) {
            assembler.addSection({
              id: 'regrounding',
              content: regrounding,
            })
          }
        } else if (!plan.bareContinuation) {
          const grounding = await this.ports.presenter.buildFollowUpGrounding(
            input.request,
            textCurrentFile,
            contextAssemblyBudget,
          )
          if (grounding) {
            assembler.addSection({
              id: 'followup_grounding',
              content: grounding,
            })
          }
        }
      }

      const embeddedPaths = new Set<string>(
        (context?.items ?? [])
          .filter(
            (item) => item.source === 'mentioned' && item.included_in_context,
          )
          .map((item) => item.path),
      )
      for (const d of digests) {
        embeddedPaths.add(d.path)
      }
      const folderInventory = this.ports.context.formatFolderInventory(
        input.mentionables ?? [],
        embeddedPaths,
      )
      if (folderInventory) {
        assembler.addSection({
          id: 'folder_inventory',
          content: folderInventory,
        })
      }

      const turnNotes = providerTurnContext(
        providerCompanionScope,
        providerNotes,
      )
      if (turnNotes)
        assembler.addSection({ id: 'companion_edit_scope', content: turnNotes })

      const { deferState: durableDeferState, turns } =
        await this.ports.runs.loadRunContextState(input.runId)
      turnRecord.bareContinuation = plan.bareContinuation
      addContinuationSections(
        assembler,
        { ...plan, currentTurn: turnRecord },
        turns,
        input.request,
        !!activeWorkflowItem,
        history,
        agentToolDefinitions.map((tool) => tool.function.name),
      )

      const plannedCoverageUnitIds =
        workflowCoverage?.coveragePacketSeeds
          ?.flatMap((seed) => seed.coverageUnitIds ?? [])
          .filter((unitId, index, ids) => ids.indexOf(unitId) === index) ?? []
      const durableCoverageUnitIds =
        durableDeferState.coverageUnitIds.length > 0
          ? durableDeferState.coverageUnitIds
          : plannedCoverageUnitIds.slice(1)
      const initialExecutionPlan = await assembler.assembleExecutionPlan({
        request: plan.intentRequest,
        decision: plan.scopeDecision,
        coverage: workflowCoverage?.coverage,
        execution:
          workflowCoverage?.coverage?.requiredScope === 'whole' ||
          plan.scopeDecision.coverage === 'whole'
            ? 'batch'
            : 'interactive',
        // effectiveBudget is the optional retrieval/compaction cap. The packet
        // admission must use the physical message budget, matching the final
        // request preflight and preserving the existing custom-cap semantics.
        inputBudgetTokens: Math.floor(messageInputBudget),
        fixedOverheadTokens,
        durableDeferSectionIds: durableDeferState.packetIds,
        durableDeferCoverageUnitIds: durableCoverageUnitIds,
      })
      const { plan: executionPlan, fitted } = refitBaseContext({
        plan: initialExecutionPlan,
        assembler,
        presenter: this.ports.presenter,
        context,
        mode:
          contextPolicy.effectiveMode === 'catalog'
            ? 'catalog'
            : contextPolicy.effectiveMode === 'off'
              ? 'off'
              : 'full',
        request: plan.intentRequest,
        catalogTokenBudget: Math.min(
          runSettings.verbex.context.catalogTokenBudget,
          contextAssemblyBudget,
        ),
        catalogCandidateLimit: runSettings.verbex.context.catalogCandidateLimit,
        signal: input.signal,
      })
      if (fitted)
        emitAgentAuditEvent(
          input.onAuditEvent,
          input.runId,
          'context_exclusion',
          'Final context fitted to the remaining budget',
          undefined,
          { ...fitted },
        )
      const executionRoute = resolveExecutionRoute({
        requestedEntryPoint: 'agent_loop',
        executor: executionPlan.executor,
      })
      await this.ports.runs.persistContextExecutionPlan(
        input.runId,
        snapshotExecutionPlan(executionPlan),
      )
      const packedContext = executionPlan.packed
      turnRecord.contextDelivery = buildContextDelivery(
        contextPolicy.effectiveMode,
        context,
        packedContext,
        fitted,
      )
      if (
        executionRoute.entryPoint === 'capacity_error' ||
        packedContext.status === 'capacity_error'
      ) {
        throw new Error(
          `[capacity_error] ${packedContext.capacityError?.message ?? 'context packet packing failed'}`,
        )
      }
      await this.ports.runs.persistContextPackerDeferState(input.runId, {
        version: 1,
        packetIds: packedContext.deferredPacketIds,
        coverageUnitIds: packedContext.deferredCoverageUnitIds,
      })
      const userContent = packedContext.text
      const selfContainedSourceArgs =
        this.ports.context.selfContainedSourceArguments(
          plan.selfContainedWorkflowTool,
          plan.effectiveCurrentFile,
          input.mentionables ?? [],
        )

      const initialMessages: RequestMessage[] = [
        { role: 'system', content: systemPrompt },
        ...priorHistory,
        {
          role: 'user',
          content: userContent,
        },
      ]
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

      // Keep runSettings pinned for tool execution, too.
      assertWorkActive(input.signal)
      const loopResult = await this.ports.settings.runWithPinnedSettings(
        runSettings,
        () =>
          runAgentLoop(initialMessages, {
            seedToolCalls: input.seedToolCalls,
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
              const turnToolDefinitions = toolsEnabled
                ? await withProviderTools(
                    selectAgentToolDefinitions(
                      agentToolRoutingText(intentRequest, messages),
                      model.promptLevel,
                      input.activeSkills,
                      plan.scopeDecision,
                    ),
                  )
                : []
              const { canonicalSelectedName, selectedTools } =
                await directiveToolDefinitions(
                  directive?.selectedToolName,
                  turnToolDefinitions,
                  prepared.projectTools,
                )
              const definitionTokens = await tokenCount(
                JSON.stringify(selectedTools),
              )
              emitToolExposure(
                runSettings.verbex.privacy.auditLogging,
                turnRecord,
                selectedTools.map((t) => t.function.name),
                input.excludedToolNames?.length ?? 0,
                definitionTokens,
                input.onAuditEvent,
              )
              messageInputBudget = chatMessageBudget(
                inputBudget,
                definitionTokens,
              )
              const fitted = await fitMessagesToTokenBudget(
                messages,
                messageInputBudget,
              )
              messages.splice(0, messages.length, ...fitted.messages)
              const stepResult = await gatedChatStep({
                settings: runSettings,
                diagnosticCallKind: 'agent',
                diagnosticReduced: !!canonicalSelectedName,
                requiredBlocks: messages,
                onWireMessages: currentSnapshot()?.observations?.sent,
                disclosureContext: {
                  runId: input.runId,
                  turnId: prepared.providerTurnId,
                  approvedConnectorVaultRead:
                    prepared.approvedConnectorVaultRead,
                },
                tools: selectedTools,
                inputBudget,
                maxTokens: outputBudget,
                temperature: modelLimits.temperature,
                ...(directive?.requireToolCall
                  ? { toolChoice: 'required' }
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
            initialDirective:
              toolsEnabled &&
              plan.selfContainedWorkflowTool &&
              AGENT_CALLABLE_TOOL_NAMES.has(plan.selfContainedWorkflowTool) &&
              !plan.buildWikiPreflightSatisfied &&
              workflowRuntime?.stepStatus !== 'completed'
                ? {
                    selectedToolName: plan.selfContainedWorkflowTool,
                    requireToolCall: true,
                    ...(selfContainedSourceArgs
                      ? { requiredArguments: selfContainedSourceArgs }
                      : {}),
                  }
                : toolsEnabled && isChapterFileSplitRequest(plan.intentRequest)
                  ? {
                      selectedToolName: 'split_file_by_chapters',
                      requireToolCall: true,
                    }
                  : toolsEnabled && plan.resumeAction?.kind === 'required_tool'
                    ? {
                        selectedToolName: plan.resumeAction.toolName,
                        requireToolCall: true,
                      }
                    : toolsEnabled &&
                        !plan.buildWikiPreflightSatisfied &&
                        plan.activeStep?.tool &&
                        AGENT_WRITE_TOOL_NAMES.has(plan.activeStep.tool) &&
                        requestIntent.fileTarget(
                          workflowRuntime?.turnIntent ?? '',
                          /(?:[^\s]+\.md\b|현재\s*(?:노트|문서|파일)|\bthis\s+(?:note|document|file)\b)/i,
                        )
                      ? {
                          selectedToolName: plan.activeStep.tool,
                          requireToolCall: true,
                        }
                      : requiresContextToolCall(
                            contextPolicy,
                            input,
                            plan,
                            digests,
                            packedContext,
                          )
                        ? { requireToolCall: true }
                        : continuationRequiresToolCall({
                              isContinuationSignal: input.isContinuationSignal,
                              toolsEnabled,
                              previousTurn: turns.at(-1),
                            })
                          ? { requireToolCall: true }
                          : undefined,
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
      const result = finalizeAgentResult(
        { ...loopResult, usage: aggregateUsage },
        executionPlan,
        executionRoute.executor,
        input.runId,
        this.ports.largeDocumentCoordinator.formatResultBadge(
          digests,
          plan.scopeDecision,
        ),
      )

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
