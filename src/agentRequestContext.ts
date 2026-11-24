import { TFile } from 'obsidian'

import type { AgentExecutionPorts } from './agentExecutionPorts'
import { commonAgentUserContent } from './agentRequestFingerprint'
import type { AgentRunInput } from './AgentRunExecution'
import { prepareAgentTurnPlan } from './agentTurnPlanning'
import { emitAgentAuditEvent } from './audit/agentRunEvent'
import { summarizeContextAudit } from './audit/contextAudit'
import {
  isBinaryDocumentFile,
  isBlankNote,
  withoutWorkflowGuide,
} from './context/agentSourcePolicy'
import { refitBaseContext } from './context/baseContextRefit'
import { ContextAssembler } from './context/ContextAssembler'
import {
  resolveConfiguredContextMode,
  resolveContextPolicy,
} from './context/contextPolicy'
import { addContinuationSections } from './context/continuationFacts'
import { effectiveContextBudget } from './context/effectiveContextBudget'
import { mergeUniqueByPath } from './context/fileCollections'
import { measureStaticPromptOverhead } from './context/promptOverhead'
import { snapshotExecutionPlan } from './core/batch/contextPacker'
import { resolveExecutionRoute } from './core/batch/executionRouter'
import { MIN_INPUT_BUDGET } from './core/llm/contextWindow'
import { providerTurnContext } from './provider/companionPrompt'
import { prepareAgentProviderTools } from './provider/prepareAgentProviderTools'
import { buildContextDelivery } from './runstate/contextDelivery'
import { TurnRecord } from './runstate/turnLedger'
import type { VerbexSettings } from './settings/schema/setting.types'
import type { ChatModel } from './types/chat-model.types'
import { RequestMessage, RequestTool } from './types/llm/request'
import { withoutCensusReports } from './utils/chat/displayOnly'
import { formatBytes } from './utils/formatBytes'
import { estimateTokens } from './utils/llm/estimateTokens'
import { AttachmentDigest } from './verbex/types'

type Planning = Awaited<ReturnType<typeof prepareAgentTurnPlan>>
type Prepared = Awaited<ReturnType<typeof prepareAgentProviderTools>>
export async function assembleAgentContext({
  ports,
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
  readOnly = false,
}: Omit<Planning, 'plan' | 'intentRequest'> & {
  plan: Extract<Planning['plan'], { kind: 'agent_loop' }>
  priorHistory: RequestMessage[]
  history: RequestMessage[]
  ports: AgentExecutionPorts
  input: AgentRunInput
  runSettings: VerbexSettings
  model: ChatModel
  toolsEnabled: boolean
  modelSupportsTools: boolean
  agentToolDefinitions: RequestTool[]
  messageInputBudget: number
  formatSources: Prepared['formatSources']
  providerCompanionScope: Prepared['companionScope']
  providerNotes: Prepared['providerNotes']
  turnRecord: TurnRecord
  readOnly?: boolean
}) {
  priorHistory = withoutCensusReports(priorHistory)
  history = withoutCensusReports(history)
  const exposedToolNames = new Set(
    agentToolDefinitions.map((t) => t.function.name),
  )
  // 2. Agent loop에 대한 컨텍스트 조립 (Context Assembly)
  // plan.kind === 'agent_loop' 상황
  let restoredReviewScope: TFile[] = []
  if (plan.activeWorkflow && !plan.checklistGated) {
    restoredReviewScope = plan.restoredScopePaths.flatMap((path) => {
      if (path === input.currentFile?.path) return []
      const file = ports.findFile(path)
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
      ? ports.workflow.activeWorkflowGuidance(
          plan.activeWorkflow,
          workflowRuntime,
          workflowRun?.artifacts ?? {},
        )
      : null
  const retainedSkillGuidance = withoutWorkflowGuide(input.skillInstructions)
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
      ? await ports.workflow.prepareWorkflowCoverage(input.runId, coverageFiles)
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
      await ports.largeDocumentCoordinator.prepareAttachments(
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
    await ports.largeDocumentCoordinator.prepareAttachments(
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
  const { prompt: systemPrompt, commonPrompt } =
    await ports.systemPromptBuilder.build({
      includeCommon: readOnly,
      now: input.now,
      skillInstructions: largeDocumentGuidance,
      currentFilePath: plan.effectiveCurrentFile?.path ?? null,
      promptLevel: model.promptLevel,
      toolsEnabled,
      exposedToolNames,
      modelInstructions: model.extraInstructions,
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
    configuredMode: resolveConfiguredContextMode(runSettings.verbex.context),
    turnOverride: input.contextModeOverride,
    isFirstTurn: plan.isFirstTurn,
    bareContinuation: plan.bareContinuation,
    toolsEnabled,
    modelSupportsTools,
    activeWorkflow: plan.activeWorkflow !== null,
    selfContainedWorkflowTool: plan.selfContainedWorkflowTool !== null,
    hasExplicitAttachments: mentionedFiles.length > 0 || smallFiles.length > 0,
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
    ? await ports.context.buildContext(
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
        ? ports.presenter.formatAgentCatalogContext(
            plan.intentRequest,
            context,
            Math.min(
              runSettings.verbex.context.catalogTokenBudget,
              contextAssemblyBudget,
            ),
            runSettings.verbex.context.catalogCandidateLimit,
          )
        : contextPolicy.effectiveMode === 'off'
          ? ports.presenter.formatAgentExplicitContext(context)
          : ports.presenter.formatAgentContext(
              plan.intentRequest,
              context,
              exposedToolNames,
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
      content: ports.largeDocumentCoordinator.formatDigests(digests),
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
      ports.largeDocumentCoordinator.formatSourceInventory(
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
      const regrounding = await ports.presenter.buildWorkflowRegrounding(
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
      const grounding = await ports.presenter.buildFollowUpGrounding(
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
      .filter((item) => item.source === 'mentioned' && item.included_in_context)
      .map((item) => item.path),
  )
  for (const d of digests) {
    embeddedPaths.add(d.path)
  }
  const folderInventory = ports.context.formatFolderInventory(
    input.mentionables ?? [],
    embeddedPaths,
  )
  if (folderInventory) {
    assembler.addSection({
      id: 'folder_inventory',
      content: folderInventory,
    })
  }

  const turnNotes = providerTurnContext(providerCompanionScope, providerNotes)
  if (turnNotes)
    assembler.addSection({ id: 'companion_edit_scope', content: turnNotes })

  const { deferState: durableDeferState, turns } =
    await ports.runs.loadRunContextState(input.runId)
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
  const {
    plan: executionPlan,
    fitted,
    fittedContext,
  } = refitBaseContext({
    plan: initialExecutionPlan,
    assembler,
    presenter: ports.presenter,
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
    exposedToolNames,
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
  if (!readOnly)
    await ports.runs.persistContextExecutionPlan(
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
  if (!readOnly)
    await ports.runs.persistContextPackerDeferState(input.runId, {
      version: 1,
      packetIds: packedContext.deferredPacketIds,
      coverageUnitIds: packedContext.deferredCoverageUnitIds,
    })
  const userContent = packedContext.text
  const selfContainedSourceArgs = ports.context.selfContainedSourceArguments(
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

  return {
    initialMessages,
    effectiveBudget,
    contextPolicy,
    context,
    digests,
    smallFiles,
    reviewMentionedFiles,
    textCurrentFile,
    packedContext,
    selfContainedSourceArgs,
    turns,
    systemPrompt,
    commonPrompt,
    workflowCoverage,
    executionPlan,
    executionRoute,
    commonUserContent: readOnly
      ? commonAgentUserContent(
          packedContext,
          contextPolicy.effectiveMode,
          plan.intentRequest,
          context,
          fittedContext,
        )
      : undefined,
  }
}
