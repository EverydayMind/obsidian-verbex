import { App, TFile, normalizePath } from 'obsidian'

import { createAgentExecutionPorts } from './agentExecutionPorts'
import { AgentRunCoordinator } from './AgentRunCoordinator'
import { CatalogService } from './catalog/CatalogService'
import { CheckpointManager } from './checkpoint/CheckpointManager'
import { restoreLastChangeOutcome } from './checkpoint/restoreLastChangeOutcome'
import { AgentContextPresenter } from './context/AgentContextPresenter'
import { AgentContextRetrieval } from './context/AgentContextRetrieval'
import { generateInlineCompletion } from './context/agentModelCalls'
import {
  ContextBuilder,
  SemanticSearchProvider,
} from './context/ContextBuilder'
import { effectiveContextBudget } from './context/effectiveContextBudget'
import {
  LexicalIndexMutation,
  LexicalIndexReconcilePlan,
  LexicalIndexRepository,
} from './context/LexicalIndex'
import {
  isSubstantiveUserText,
  lastSubstantiveUserText,
} from './context/taskPinning'
import {
  resolveApplyFile,
  resolveBoundedSectionBlock,
  sectionChange,
} from './core/apply/sectionBlockApply'
import { LargeDocumentCoordinator } from './core/large-document/LargeDocumentCoordinator'
import {
  computeInputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from './core/llm/contextWindow'
import { getChatModelClient } from './core/llm/manager'
import { resolveChatModelId } from './core/llm/modelSelection'
import { ReviewIndexCoordinator } from './core/review-index/ReviewIndexCoordinator'
import { ReviewIndexRuntime } from './core/review-index/ReviewIndexRuntime'
import { NoteTidyApplier } from './core/tidy/tidyApply'
import { AgentToolExecutor } from './core/tools/AgentToolExecutor'
import { LocalToolRegistry } from './core/tools/localTools'
import { CANONICAL_TOOL_MAP } from './core/tools/toolDefinitions'
import {
  changeProposalFailure,
  inventoryFolder,
  inventoryHeader,
  inventoryMark,
  inventoryOmitted,
  inventoryWiki,
} from './folderInventoryText'
import { PermissionManager } from './permissions/PermissionManager'
import { PlanTracker } from './plan/PlanTracker'
import { SystemPromptBuilder } from './prompt/SystemPromptBuilder'
import { pluginIsEnabled } from './provider/interop/discovery'
import type { ProviderRuntime } from './provider/ToolProviderHub'
import { RunLifecycle, StatusListener } from './runstate/RunLifecycle'
import { RunStateRepository } from './runstate/RunStateRepository'
import { ToolOutcomeRecorder } from './runstate/ToolOutcomeRecorder'
import type { PluginRuntimeLifecycle } from './runtime/PluginRuntimeLifecycle'
import { issueApplyPermit } from './security/promptInjectionBoundary'
import { assertUserVaultPath } from './security/vaultPathPolicy'
import { VerbexSettings } from './settings/schema/setting.types'
import { StatusSnapshotService } from './status/StatusSnapshotService'
import { ChatWorkflowContextItem } from './types/chat'
import { RequestMessage } from './types/llm/request'
import { Mentionable, MentionableFolder } from './types/mentionable'
import type { InlineWritingInput } from './utils/chat/inlineWriting'
import { formatBytes } from './utils/formatBytes'
import { getNestedFiles } from './utils/obsidian'
import {
  CheckpointRecord,
  ProposedChange,
  VerbexContextTrace,
  VerbexPlanStep,
  VerbexRunState,
  VerbexStatusSnapshot,
  WorkflowDefinition,
} from './verbex/types'
import { slugifyId } from './verbex/vault'
import { AgentWriteVerifier } from './verification/AgentWriteVerifier'
import { VaultChangeApplier } from './workflow/changeApplier'
import { buildApproval, computeChangeBlocks } from './workflow/changeSet'
import { ChangeOutcome, StepExecutor } from './workflow/StepExecutor'
import { WorkflowCoordinator } from './workflow/WorkflowCoordinator'
export type { LargeOperationConfirmation } from './core/large-document/LargeDocumentCoordinator'

/**
 * Treaty-wiki target gate. Asked once per run/source before the wiki is built
 * or reused: the user confirms (or edits) the destination folder and chooses
 * whether to build fresh, rebuild over an existing wiki, or reuse it as-is.
 * Resolving `null` cancels the wiki flow for this call.
 */
/**
 * Whether a follow-up turn's message is a fresh, substantive question that
 * warrants re-grounding (A-3), versus a bare continuation / acknowledgement
 * ("진행하세요", "계속", "네", "고마워", "ok") that only advances the existing
 * task and needs no new retrieval. Keeps the follow-up grounding retrieval off
 * the conversational filler turns.
 */
export type {
  WikiTargetDecision,
  WikiTargetMode,
} from './core/review-index/ReviewIndexCoordinator'

export function isSubstantiveFollowUp(text: string): boolean {
  return isSubstantiveUserText(text)
}

/**
 * The most recent user turn that carried a real task, scanning newest-first.
 * Continuation tokens ("진행", "계속", …) advance a workflow stage but say
 * nothing to retrieve against, so re-grounding a follow-up turn must reach back
 * to the request that actually set the task. Falls back to the current request
 * when history holds nothing more substantive.
 */
export function lastSubstantiveRequest(
  history: readonly RequestMessage[],
  fallback: string,
): string {
  return lastSubstantiveUserText(history, fallback)
}

const MAX_FOLDER_INVENTORY_ENTRIES = 50

export class VerbexController {
  readonly catalogService: CatalogService
  /** @deprecated compatibility facades; CatalogService owns the snapshots. */
  get skillLoader(): Pick<CatalogService, 'listSkills'> {
    return this.catalogService
  }
  /** @deprecated compatibility facade; CatalogService owns the snapshots. */
  get workflowLoader(): Pick<CatalogService, 'listWorkflows'> {
    return this.catalogService
  }
  readonly runStateRepository: RunStateRepository
  readonly lexicalIndex: LexicalIndexRepository
  readonly contextBuilder: ContextBuilder
  readonly systemPromptBuilder: SystemPromptBuilder
  readonly permissionManager: PermissionManager
  readonly checkpointManager: CheckpointManager
  readonly localTools: LocalToolRegistry
  readonly stepExecutor: StepExecutor
  readonly reviewIndexRuntime: ReviewIndexRuntime
  readonly reviewIndexCoordinator: ReviewIndexCoordinator
  readonly largeDocumentCoordinator: LargeDocumentCoordinator
  readonly runLifecycle: RunLifecycle
  readonly statusSnapshotService: StatusSnapshotService
  readonly workflowCoordinator: WorkflowCoordinator
  readonly agentTools: AgentToolExecutor
  readonly agentWriteVerifier: AgentWriteVerifier
  readonly toolOutcomes: ToolOutcomeRecorder
  readonly contextRetrieval: AgentContextRetrieval
  readonly agentContext: AgentContextPresenter
  readonly agentRunCoordinator: AgentRunCoordinator
  readonly providerRegistry?: ProviderRuntime
  private workflowDefinitions = new Map<string, WorkflowDefinition>()
  // Pinned during one AgentRunCoordinator.run() (§8-5, see below).
  private activeRunSettings: VerbexSettings | null = null

  private getSemanticProvider:
    | (() => Promise<SemanticSearchProvider | null>)
    | null = null
  private peekSemanticProvider: (() => SemanticSearchProvider | null) | null =
    null
  constructor(
    private app: App,
    private settings: VerbexSettings,
    getSecrets: () => string[] = () => [],
    getSemanticProvider?: () => Promise<SemanticSearchProvider | null>,
    peekSemanticProvider?: () => SemanticSearchProvider | null,
    providerRegistry?: ProviderRuntime,
    lifecycle?: PluginRuntimeLifecycle,
    semanticAvailability?: import('./core/tools/localToolCommon').ToolExecutionContext['semanticAvailability'],
    requestSemanticPreparation?: () => void,
    semanticRequested?: () => boolean,
  ) {
    this.providerRegistry = providerRegistry
    this.getSemanticProvider = getSemanticProvider ?? null
    this.peekSemanticProvider = peekSemanticProvider ?? null
    this.catalogService = new CatalogService(app, {
      skillsFolder: this.settings.skillsFolder,
      workflowsFolder: this.settings.workflowsFolder,
      promptsFolder: this.settings.promptsFolder,
    })
    this.runStateRepository = new RunStateRepository(app, getSecrets)
    this.lexicalIndex = new LexicalIndexRepository(app, settings)
    this.contextBuilder = new ContextBuilder(
      app,
      settings,
      this.lexicalIndex,
      getSemanticProvider,
      peekSemanticProvider,
    )
    this.systemPromptBuilder = new SystemPromptBuilder(app, settings)
    this.permissionManager = new PermissionManager(
      settings.verbex.permissions,
      (path) => assertUserVaultPath(this.app, path),
      (name) => this.providerRegistry?.getToolMetadata?.(name),
    )
    this.checkpointManager = new CheckpointManager(app)
    this.runLifecycle = new RunLifecycle(
      app,
      this.runStateRepository,
      this.checkpointManager,
      {
        bootstrapped: false,
        skills: [],
        workflows: [],
        workflowErrors: [],
        activeRun: null,
        pausedRuns: [],
        lexicalIndex: null,
        embeddingIndex: null,
        providerStatus: {
          registryAvailable: false,
          protocolVersion: null,
          generation: null,
          providers: [],
          toolNames: [],
        },
        lastContext: null,
        lastError: null,
      },
      (path) => this.openAppliedNote(path),
      () => this.getSettings(),
    )
    this.statusSnapshotService = new StatusSnapshotService(
      this.runLifecycle,
      { skillLoader: this.catalogService, workflowLoader: this.catalogService },
      this.lexicalIndex,
      this.runStateRepository,
      this.getSemanticProvider,
      this.peekSemanticProvider,
      (definitions) => {
        this.workflowDefinitions = definitions
      },
      providerRegistry,
      (id) => pluginIsEnabled(app, id),
    )
    // Semantic retrieval is optional. When the RAG engine is still warming
    // up, local tools must fall back to BM25 instead of waiting for PGlite or
    // a failed embedding endpoint during the user's turn.
    const getReadySemanticProvider = peekSemanticProvider
      ? () => Promise.resolve(peekSemanticProvider())
      : getSemanticProvider
    this.localTools = new LocalToolRegistry(
      app,
      () => {
        const settings = this.getEffectiveSettings()
        const { model } = getChatModelClient({
          modelId: resolveChatModelId({ settings }).modelId,
          settings,
        })
        const contextWindow = resolveContextWindow(model)
        const inputBudget = computeInputBudget(
          contextWindow,
          computeOutputBudget(
            contextWindow,
            settings.verbex.context.reservedOutputTokens,
          ),
        )
        return effectiveContextBudget(settings, inputBudget)
      },
      getReadySemanticProvider,
      undefined,
      () => this.getEffectiveSettings().vaultWikiFolder,
      providerRegistry,
      this.lexicalIndex,
      () => this.getEffectiveSettings(),
      { semanticAvailability, requestSemanticPreparation, semanticRequested },
    )
    this.localTools.restoreLastChange = (runId, signal) => {
      const decision = this.permissionManager.decide('restore_last_change')
      if (decision.action === 'deny')
        return Promise.resolve({
          status: 'rejected',
          terminal: false,
          mutation: 'none',
          displayText: decision.reason,
        })
      return restoreLastChangeOutcome(
        this.runLifecycle.dispatcher,
        runId,
        signal,
      )
    }
    this.stepExecutor = new StepExecutor({
      permissions: this.permissionManager,
      checkpoints: this.checkpointManager,
      applier: new VaultChangeApplier(app, (...paths) =>
        this.catalogService.invalidateForPath(...paths),
      ),
      compositeApplier: new NoteTidyApplier(app),
    })

    const vaultAdapter = {
      exists: (path: string) => this.app.vault.adapter.exists(path),
      read: (path: string) => this.app.vault.adapter.read(path),
      getMarkdownFiles: () => this.app.vault.getMarkdownFiles(),
    }
    const writerAdapter = {
      proposedWrite: async (path: string, content: string, tool: string) => {
        const result = await this.localTools.execute('write_file', {
          path,
          content,
        })
        if (result.kind !== 'change') {
          throw new Error(
            result.kind === 'error'
              ? result.message
              : changeProposalFailure(path),
          )
        }
        result.change.tool = tool
        return result.change
      },
    }
    this.reviewIndexRuntime = new ReviewIndexRuntime(
      vaultAdapter,
      writerAdapter,
    )
    this.reviewIndexCoordinator = new ReviewIndexCoordinator({
      app: this.app,
      getSettings: () => this.getEffectiveSettings(),
      runtime: this.reviewIndexRuntime,
      localTools: this.localTools,
      stepExecutor: this.stepExecutor,
      loadRunForUpdate: (runId, title) => this.loadRunForUpdate(runId, title),
      updateRunArtifacts: (...args) => this.updateRunArtifacts(...args),
      recordToolOutcome: (runId, outcome, options) =>
        this.recordToolOutcome(runId, outcome, options),
    })
    this.workflowCoordinator = new WorkflowCoordinator(
      this.app,
      this.runLifecycle,
      this.reviewIndexCoordinator,
    )
    this.largeDocumentCoordinator = new LargeDocumentCoordinator({
      app: this.app,
      getSettings: () => this.getEffectiveSettings(),
      loadRunForUpdate: (runId, title) => this.loadRunForUpdate(runId, title),
      updateRunArtifacts: (...args) => this.updateRunArtifacts(...args),
      localTools: this.localTools,
      stepExecutor: this.stepExecutor,
      recordToolOutcome: (runId, outcome) =>
        this.recordToolOutcome(runId, outcome),
    })
    this.toolOutcomes = new ToolOutcomeRecorder({
      runs: this.runLifecycle,
      repository: this.runStateRepository,
      getWorkflow: (id) => this.workflowDefinitions.get(id),
    })
    this.agentWriteVerifier = new AgentWriteVerifier(() =>
      this.app.vault.getMarkdownFiles(),
    )
    this.agentTools = new AgentToolExecutor({
      providerRegistry,
      largeDocumentCoordinator: this.largeDocumentCoordinator,
      reviewIndexCoordinator: this.reviewIndexCoordinator,
      runs: this.runLifecycle,
      outcomes: this.toolOutcomes,
      verifier: this.agentWriteVerifier,
      localTools: this.localTools,
      stepExecutor: this.stepExecutor,
    })
    this.contextRetrieval = new AgentContextRetrieval(() => this.settings, {
      builder: this.contextBuilder,
      lexicalIndex: this.lexicalIndex,
      runs: this.runLifecycle,
    })
    this.agentContext = new AgentContextPresenter((query, file, budget) =>
      this.contextRetrieval.buildContext(query, file, [], budget),
    )
    this.agentRunCoordinator = new AgentRunCoordinator(
      createAgentExecutionPorts(this),
      lifecycle,
    )
  }
  setSettings(settings: VerbexSettings): void {
    this.settings = settings
    this.catalogService.setPaths({
      skillsFolder: settings.skillsFolder,
      workflowsFolder: settings.workflowsFolder,
      promptsFolder: settings.promptsFolder,
    })
    this.workflowDefinitions = new Map()
    this.lexicalIndex.setSettings(settings)
    this.contextBuilder.setSettings(settings)
    this.systemPromptBuilder.setSettings(settings)
    this.permissionManager.setPermissions(settings.verbex.permissions)
  }

  getApp(): App {
    return this.app
  }

  getSettings(): VerbexSettings {
    return this.settings
  }
  // Run-scoped deps read this instead of `settings` (see activeRunSettings).
  getEffectiveSettings(): VerbexSettings {
    return this.activeRunSettings ?? this.settings
  }
  async runWithPinnedSettings<T>(pin: VerbexSettings, fn: () => Promise<T>) {
    const previous = this.activeRunSettings
    this.activeRunSettings = pin
    try {
      return await fn()
    } finally {
      this.activeRunSettings = previous
    }
  }

  async refresh(
    options: { embeddingStats?: 'if-ready' | 'eager' } = {},
  ): Promise<VerbexStatusSnapshot> {
    this.catalogService.invalidate()
    return this.statusSnapshotService.refresh(options)
  }

  async refreshLexicalIndex(): Promise<VerbexStatusSnapshot> {
    return this.statusSnapshotService.refreshLexicalIndex()
  }

  // --- Incremental BM25 indexing (wired to vault file events in main.ts) ---

  async indexFile(file: TFile): Promise<void> {
    await this.lexicalIndex.updateFile(file)
    await this.syncLexicalStats()
  }

  async removeIndexedFile(path: string): Promise<void> {
    await this.lexicalIndex.removeFile(path)
    await this.syncLexicalStats()
  }

  async renameIndexedFile(oldPath: string, file: TFile): Promise<void> {
    await this.lexicalIndex.renameFile(oldPath, file)
    await this.syncLexicalStats()
  }

  async applyLexicalIndexMutations(
    mutations: readonly LexicalIndexMutation[],
  ): Promise<void> {
    await this.lexicalIndex.applyMutations(mutations)
    await this.syncLexicalStats()
  }

  async computeLexicalIndexReconcile(): Promise<LexicalIndexReconcilePlan> {
    return this.lexicalIndex.computeReconcilePlan()
  }

  private async syncLexicalStats(): Promise<void> {
    await this.statusSnapshotService.syncLexicalStats()
  }

  buildContext(...args: Parameters<AgentContextRetrieval['buildContext']>) {
    return this.contextRetrieval.buildContext(...args)
  }

  // --- M5: Auto Mode, tool execution, checkpoints, rollback ---

  setAutoMode(on: boolean): void {
    this.permissionManager.setAutoMode(on)
  }

  toggleAutoMode(): boolean {
    const next = !this.permissionManager.isAutoMode()
    this.permissionManager.setAutoMode(next)
    return next
  }

  autoModeStatus(): string {
    return this.permissionManager.autoModeStatus()
  }

  /**
   * Run a Local Tool. Read tools return text; mutating tools yield a proposed
   * change that is routed through the permission / checkpoint / Diff pipeline
   * and only then applied to the vault.
   */
  async runTool(
    runId: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<
    | { kind: 'read'; text: string }
    | { kind: 'error'; message: string }
    | { kind: 'applied'; outcome: ChangeOutcome }
    | {
        kind: 'outcome'
        outcome: import('./core/llm/toolOutcome').AgentToolOutcome
      }
  > {
    const canonicalName = CANONICAL_TOOL_MAP[tool] ?? tool
    if (canonicalName !== tool) {
      tool = canonicalName
      if (args.wiki_folder !== undefined) {
        args.index_folder = args.wiki_folder
        delete args.wiki_folder
      }
    }
    const result = await this.localTools.execute(tool, args)
    if (result.kind !== 'change') {
      return result
    }
    const outcome = await this.stepExecutor.processChange(runId, result.change)
    await this.recordToolOutcome(runId, outcome)
    return { kind: 'applied', outcome }
  }

  async proposeToolChange(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<ProposedChange | null> {
    const canonicalName = CANONICAL_TOOL_MAP[tool] ?? tool
    if (canonicalName !== tool) {
      tool = canonicalName
      if (args.wiki_folder !== undefined) {
        args.index_folder = args.wiki_folder
        delete args.wiki_folder
      }
    }
    const result = await this.localTools.execute(tool, args)
    return result.kind === 'change' ? result.change : null
  }

  async applyBoundedSection(input: {
    runId: string
    path: string
    before: string
    block: string
  }): Promise<ChangeOutcome> {
    const file = resolveApplyFile(this.app, input.path)
    if (!file) throw new Error(`Section target does not exist: ${input.path}`)
    const section = resolveBoundedSectionBlock(input.block, input.before)
    if ('ambiguous' in section)
      throw new Error(`Ambiguous section: ${section.ambiguous}`)
    const outcome = await this.stepExecutor.processChange(
      input.runId,
      sectionChange(file.path, input.before, section),
    )
    await this.recordToolOutcome(input.runId, outcome)
    return outcome
  }

  /**
   * Apply an assistant draft only after the user has chosen a target note.
   *
   * Existing notes keep the normal Diff / hunk review path. With strategy
   * 'append' the draft is added to the end of the note; 'section' replaces one
   * Markdown heading section; with 'replace' the whole note is replaced. New notes are
   * created directly from the draft once the Apply target is confirmed, while
   * still passing the write permission gate and checkpoint-before-write policy.
   */
  async applyDraftToNote(input: {
    runId: string
    path: string
    content: string
    /**
     * How to combine the draft with an existing note. 'replace' overwrites the
     * whole note; 'append' adds the draft to the end. Ignored when the note
     * does not exist yet — a new note is always created from the draft as-is.
     * Defaults to 'replace' to preserve the previous behaviour.
     */
    strategy?: 'replace' | 'append' | 'section'
    /** Exact Markdown heading text (without #) used by section strategy. */
    sectionHeading?: string
  }): Promise<ChangeOutcome> {
    const path = normalizePath(input.path)
    if (!path.endsWith('.md')) {
      throw new Error(
        'Apply target must be a Markdown note path ending in .md.',
      )
    }
    let sectionReplacement:
      | { oldString: string; newString: string }
      | null
      | undefined
    if (input.strategy === 'section') {
      const file = this.app.vault.getFileByPath(path)
      if (!file) throw new Error(`Section target does not exist: ${path}`)
      const heading = input.sectionHeading?.trim()
      if (!heading) throw new Error('Section heading is required.')
      const source = await this.app.vault.cachedRead(file)
      sectionReplacement = this.findMarkdownSection(
        source,
        heading,
        input.content,
      )
      if (!sectionReplacement) {
        throw new Error(`Markdown section not found: ${heading}`)
      }
    }
    const change =
      input.strategy === 'section' && sectionReplacement
        ? await this.proposeToolChange('replace_in_file', {
            path,
            old_string: sectionReplacement.oldString,
            new_string: sectionReplacement.newString,
          })
        : input.strategy === 'append'
          ? await this.proposeToolChange('update_file', {
              path,
              content: input.content,
              append: true,
            })
          : await this.proposeToolChange('write_file', {
              path,
              content: input.content,
            })
    if (!change) {
      throw new Error(`Failed to prepare Apply change for ${path}`)
    }

    if (change.op !== 'create') {
      const outcome = await this.stepExecutor.processChange(input.runId, change)
      await this.recordToolOutcome(input.runId, outcome)
      return outcome
    }

    const decision = this.permissionManager.decide(change.tool)
    if (decision.action === 'deny') {
      const outcome: ChangeOutcome = {
        change,
        status: 'denied',
        reason: decision.reason,
      }
      await this.recordToolOutcome(input.runId, outcome)
      return outcome
    }

    // Optimistic-lock check: the create proposal assumed no file at this path.
    // If one appeared meanwhile (user or another agent), abort rather than
    // clobbering it.
    const applier = new VaultChangeApplier(this.app)
    if ((await applier.readCurrent(change.path)) !== null) {
      const outcome: ChangeOutcome = {
        change,
        status: 'conflict',
        reason: `Conflict: "${change.path}" already exists since the change was proposed; not overwriting.`,
      }
      await this.recordToolOutcome(input.runId, outcome)
      return outcome
    }

    let checkpointId: string | undefined
    if (decision.requiresCheckpoint) {
      try {
        const checkpoint = await this.checkpointManager.create(input.runId, [
          {
            op: change.op,
            path: change.path,
            originalPath: change.originalPath,
            before: change.before,
          },
        ])
        checkpointId = checkpoint.id
      } catch (error) {
        const outcome: ChangeOutcome = {
          change,
          status: 'checkpoint_failed',
          error: error instanceof Error ? error.message : String(error),
        }
        await this.recordToolOutcome(input.runId, outcome)
        return outcome
      }
    }

    const blocks = computeChangeBlocks(change)
    const approval = buildApproval(
      change,
      blocks,
      [],
      'Apply target confirmed by user.',
    )
    try {
      const execution = await issueApplyPermit(change, input.runId)
      await applier.apply(change, change.after ?? '', execution, {
        runId: input.runId,
        turnId: `apply-${change.id}`,
      })
    } catch (error) {
      const outcome: ChangeOutcome = {
        change,
        status: 'apply_failed',
        approval,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      }
      await this.recordToolOutcome(input.runId, outcome)
      return outcome
    }

    const outcome: ChangeOutcome = {
      change,
      status: 'applied',
      approval,
      checkpointId,
      appliedContent: change.after ?? '',
    }
    await this.recordToolOutcome(input.runId, outcome)
    return outcome
  }

  private findMarkdownSection(
    source: string,
    heading: string,
    draft: string,
  ): { oldString: string; newString: string } | null {
    const lines = source.split('\n')
    const target = heading.trim().toLowerCase()
    const start = lines.findIndex((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      return match?.[2]?.trim().toLowerCase() === target
    })
    if (start < 0) return null
    const level = /^(#{1,6})\s+/.exec(lines[start])?.[1].length ?? 6
    let end = lines.length
    for (let index = start + 1; index < lines.length; index += 1) {
      const match = /^(#{1,6})\s+/.exec(lines[index])
      if (match && match[1].length <= level) {
        end = index
        break
      }
    }
    const oldString = lines.slice(start, end).join('\n').replace(/\n+$/, '')
    const trimmedDraft = draft.trim()
    const hasHeading = /^#{1,6}\s+/m.test(trimmedDraft)
    const newString = hasHeading
      ? trimmedDraft
      : `${lines[start]}\n${trimmedDraft}`
    return { oldString, newString }
  }

  parseToolArgs(...args: Parameters<AgentToolExecutor['parseToolArgs']>) {
    return this.agentTools.parseToolArgs(...args)
  }

  executeAgentTool(...args: Parameters<AgentToolExecutor['executeAgentTool']>) {
    return this.agentTools.executeAgentTool(...args)
  }

  verifyAgentWriteDetailed(
    ...args: Parameters<AgentWriteVerifier['verifyAgentWriteDetailed']>
  ) {
    return this.agentWriteVerifier.verifyAgentWriteDetailed(...args)
  }

  formatVerificationWarning(
    ...args: Parameters<AgentWriteVerifier['formatVerificationWarning']>
  ) {
    return this.agentWriteVerifier.formatVerificationWarning(...args)
  }

  hasBatchPathConflict(
    ...args: Parameters<AgentToolExecutor['hasBatchPathConflict']>
  ) {
    return this.agentTools.hasBatchPathConflict(...args)
  }

  /** Compatibility delegates; context presentation belongs to agentContext. */
  formatAgentContext(request: string, context: VerbexContextTrace): string {
    return this.agentContext.formatAgentContext(request, context)
  }

  formatAgentCatalogContext(
    ...args: Parameters<AgentContextPresenter['formatAgentCatalogContext']>
  ): string {
    return this.agentContext.formatAgentCatalogContext(...args)
  }

  formatAgentExplicitContext(context: VerbexContextTrace): string {
    return this.agentContext.formatAgentExplicitContext(context)
  }

  buildFollowUpGrounding(
    ...args: Parameters<AgentContextPresenter['buildFollowUpGrounding']>
  ): Promise<string> {
    return this.agentContext.buildFollowUpGrounding(...args)
  }

  buildWorkflowRegrounding(
    ...args: Parameters<AgentContextPresenter['buildWorkflowRegrounding']>
  ): Promise<string> {
    return this.agentContext.buildWorkflowRegrounding(...args)
  }

  /**
   * Resolve the files a user attached as context. `file` mentions contribute
   * the note itself; `folder` mentions contribute every nested note in the
   * folder (요구: 폴더 선택 시 폴더 내 파일들이 모두 컨텍스트에 포함). Deduped by path
   * so a file mentioned both directly and via its folder is read once.
   */
  resolveMentionedFiles(mentionables: Mentionable[]): TFile[] {
    const files: TFile[] = []
    const seen = new Set<string>()
    const add = (file: TFile) => {
      if (seen.has(file.path)) return
      seen.add(file.path)
      files.push(file)
    }
    for (const mentionable of mentionables) {
      if (mentionable.type === 'file') {
        add(mentionable.file)
      } else if (mentionable.type === 'folder') {
        for (const file of getNestedFiles(mentionable.folder, this.app.vault)) {
          add(file)
        }
      }
    }
    return files
  }

  /**
   * Resolve the source argument for a server-side tool that consumes the file
   * directly. The active/attached source is runtime state, so do not make a
   * small model copy its path out of prompt prose. Ambiguous mixed selections
   * are intentionally left unresolved for the model/user to disambiguate.
   */
  selfContainedSourceArguments(
    toolName: string | null,
    currentFile: TFile | null | undefined,
    mentionables: Mentionable[],
  ): Record<string, string> | undefined {
    if (toolName !== 'build_treaty_wiki' && toolName !== 'build_review_index')
      return undefined

    const folders = [
      ...new Set(
        mentionables
          .filter((item): item is MentionableFolder => item.type === 'folder')
          .map(({ folder }) => normalizePath(folder.path).replace(/\/$/, ''))
          .filter(Boolean),
      ),
    ]
    const explicitlyMentionedFiles = [
      ...new Set(
        mentionables
          .flatMap((item) => {
            if (item.type === 'file') return [item.file.path]
            if (item.type === 'current-file' && item.file)
              return [item.file.path]
            return []
          })
          .map((path) => normalizePath(path)),
      ),
    ]

    if (folders.length === 1 && explicitlyMentionedFiles.length === 0) {
      return { source_folder: folders[0] }
    }
    if (folders.length === 0 && explicitlyMentionedFiles.length === 1) {
      return { source_path: explicitlyMentionedFiles[0] }
    }
    if (
      folders.length === 0 &&
      explicitlyMentionedFiles.length === 0 &&
      currentFile
    ) {
      return { source_path: normalizePath(currentFile.path) }
    }
    return undefined
  }

  /**
   * Build a complete inventory of every file in each user-attached folder.
   *
   * A folder's files are seeded into context in full (via {@link buildContext}),
   * but the context-window budget can mean only some of them fit — the rest are
   * silently dropped, so the model never learns they exist. This lists every file
   * regardless of the budget and marks whether its body is already in context, so
   * the model has the folder's full inventory and can pull any list-only file
   * with the read_file tool. Returns null when no folder was attached.
   */
  formatFolderInventory(
    mentionables: Mentionable[],
    embeddedPaths: Set<string>,
  ): string | null {
    const folders = mentionables.filter(
      (m): m is MentionableFolder => m.type === 'folder',
    )
    if (folders.length === 0) {
      return null
    }
    const seenFolders = new Set<string>()
    const blocks: string[] = []
    for (const { folder } of folders) {
      if (seenFolders.has(folder.path)) continue
      seenFolders.add(folder.path)
      const files = [...getNestedFiles(folder, this.app.vault)].sort((a, b) => {
        const priority =
          Number(this.isVaultWikiPath(b.path)) -
          Number(this.isVaultWikiPath(a.path))
        return priority || a.path.localeCompare(b.path)
      })
      if (files.length === 0) continue
      const visibleFiles = files.slice(0, MAX_FOLDER_INVENTORY_ENTRIES)
      const lines = visibleFiles.map((file) => {
        const mark = inventoryMark(embeddedPaths.has(file.path))
        const wiki = this.isVaultWikiPath(file.path) ? inventoryWiki() : ''
        return `- [${mark}]${wiki} ${file.path} (${formatBytes(file.stat.size)})`
      })
      if (visibleFiles.length < files.length) {
        lines.push(inventoryOmitted(files.length - visibleFiles.length))
      }
      blocks.push(
        inventoryFolder(folder.path || '/', files.length, lines.join('\n')),
      )
    }
    if (blocks.length === 0) {
      return null
    }
    return inventoryHeader(blocks.join('\n\n'))
  }

  private isVaultWikiPath(path: string): boolean {
    const folder = normalizePath(this.settings.vaultWikiFolder.trim()).replace(
      /\/$/,
      '',
    )
    return folder.length > 0 && normalizePath(path).startsWith(`${folder}/`)
  }

  async runAgent(input: Parameters<AgentRunCoordinator['run']>[0]) {
    return this.agentRunCoordinator.run(input)
  }
  async generateInlineCompletion(
    input: InlineWritingInput & { signal?: AbortSignal },
  ): Promise<{ text: string; warnings: string[] }> {
    return generateInlineCompletion(this.settings, input)
  }

  async loadRunForUpdate(
    runId: string,
    fallbackTitle: string,
    fallbackPlan: VerbexPlanStep[] = PlanTracker.createAdhocPlan(fallbackTitle),
  ): Promise<VerbexRunState> {
    return this.runLifecycle.loadRunForUpdate(
      runId,
      fallbackTitle,
      fallbackPlan,
    )
  }

  private async saveRunAndUpdateSnapshot(run: VerbexRunState): Promise<void> {
    await this.runLifecycle.saveRunAndUpdateSnapshot(run)
  }

  private async updateRunArtifacts(
    runId: string,
    mutate: (run: VerbexRunState) => VerbexRunState,
    title?: string,
  ): Promise<void> {
    await this.runLifecycle.updateRunArtifacts(runId, mutate, title)
  }

  recordToolOutcome(
    ...args: Parameters<ToolOutcomeRecorder['recordToolOutcome']>
  ) {
    return this.toolOutcomes.recordToolOutcome(...args)
  }

  private async openAppliedNote(path: string): Promise<void> {
    await this.runLifecycle.openAppliedNote(path)
  }

  private async verifyWorkflowStepCompletion(
    step: NonNullable<ChatWorkflowContextItem['steps']>[number],
    run: VerbexRunState,
  ): Promise<
    | { complete: true; warnings?: string[] }
    | { complete: false; remaining: string[] }
  > {
    return this.workflowCoordinator.verifyStepCompletion(step, run)
  }

  async listCheckpoints(runId?: string): Promise<CheckpointRecord[]> {
    return this.runLifecycle.listCheckpoints(runId)
  }

  async cleanCheckpoints(): Promise<{ removed: number; freedBytes: number }> {
    return this.runLifecycle.cleanCheckpoints()
  }

  /**
   * Restore the vault to a checkpoint. Without `checkpointId`, restores **all**
   * checkpoints for the target run in reverse chronological order (newest first)
   * so every file touched in a batch is returned to its pre-run state. With a
   * specific `checkpointId`, only that one checkpoint is restored.
   */
  async rollbackRun(
    runId?: string,
    checkpointId?: string,
  ): ReturnType<RunLifecycle['rollbackRun']> {
    return this.runLifecycle.rollbackRun(runId, checkpointId)
  }

  getSnapshot(): VerbexStatusSnapshot {
    return this.statusSnapshotService.getSnapshot()
  }

  addStatusListener(listener: StatusListener): () => void {
    return this.statusSnapshotService.addStatusListener(listener)
  }

  async pauseActiveRun(): Promise<VerbexRunState | null> {
    return this.runLifecycle.pauseActiveRun()
  }

  getUnreadableRunCount(): number {
    return this.runLifecycle.getUnreadableRunCount()
  }

  async getResumableRuns(): Promise<VerbexRunState[]> {
    return this.runLifecycle.getResumableRuns()
  }

  /**
   * Restore a paused/interrupted run as the active run. Loads the saved Run
   * State, re-derives its status from the plan, persists it, and surfaces it
   * in the status snapshot. Step execution itself is wired up in M5; this
   * restores the run so it can be continued.
   */
  async resumeRun(runId?: string): Promise<VerbexRunState | null> {
    return this.runLifecycle.resumeRun(runId)
  }

  getSkillsSummary(): string {
    return this.statusSnapshotService.getSkillsSummary()
  }

  getPlanSummary(): string {
    return this.statusSnapshotService.getPlanSummary()
  }

  private createRunId(request: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const slug = slugifyId(request).slice(0, 32) || 'adhoc'
    return `run-${timestamp}-${slug}`
  }
}
