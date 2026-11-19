import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
  normalizePath,
} from 'obsidian'

import { ApplyView } from './ApplyView'
import { formatVerbexBuildInfo } from './buildInfo'
import { ChatView } from './ChatView'
import { BinaryCheckpointManager } from './checkpoint/BinaryCheckpointManager'
import { ProviderCheckpointStore } from './checkpoint/ProviderCheckpointStore'
import { RunCheckpointDispatcher } from './checkpoint/RunCheckpointDispatcher'
import { ChatProps } from './components/chat-view/Chat'
import type { IndexProgress } from './components/chat-view/QueryProgress'
import { VerbexBatchDiffModal } from './components/diff-view/VerbexBatchDiffModal'
import { VerbexDiffModal } from './components/diff-view/VerbexDiffModal'
import { CheckpointRunsModal } from './components/modals/CheckpointRunsModal'
import { requestCommitApproval } from './components/modals/CommitApprovalModal'
import { ConfirmModal } from './components/modals/ConfirmModal'
import { requestDocumentJobBodyChoice } from './components/modals/DocumentJobBodyChoiceModal'
import { ErrorModal } from './components/modals/ErrorModal'
import { promptInline } from './components/modals/InlinePromptModal'
import { InstallerUpdateRequiredModal } from './components/modals/InstallerUpdateRequiredModal'
import { requestMcpApproval } from './components/modals/McpApprovalModal'
import { requestSessionEditApproval } from './components/modals/SessionEditApprovalModal'
import { requestTextRollbackApproval } from './components/modals/TextRollbackApprovalModal'
import { EmbeddingDbManageModal } from './components/settings/modals/EmbeddingDbManageModal'
import {
  APPLY_VIEW_TYPE,
  CHAT_VIEW_TYPE,
  RELATED_VIEW_TYPE,
  STATUS_VIEW_TYPE,
  VERBEX_DIR,
} from './constants'
import { LexicalIndexMutation } from './context/LexicalIndex'
import { LexicalIndexUpdateQueue } from './context/LexicalIndexUpdateQueue'
import { BackgroundWorkScheduler } from './core/background/backgroundScheduler'
import {
  ModelDiscoveryCache,
  createModelDiscoveryCache,
} from './core/llm/modelDiscovery'
import { readMcpSecret } from './core/mcp/credentials'
import { McpManager } from './core/mcp/mcpManager'
import { McpOAuthService } from './core/mcp/McpOAuthService'
import { dailyNoteExclusion } from './core/rag/dailyNoteFilter'
import {
  DocumentIndexingControl,
  installDocumentIndexing,
  reconcileDocuments,
} from './core/rag/documentSources/runtime'
import { getEmbeddingModelClient } from './core/rag/embedding'
import {
  EmbeddingIndexActivityStore,
  shouldNotifyEmbeddingIndex,
} from './core/rag/embeddingIndexActivity'
import {
  embeddingSettingsChanged,
  initialSearchSettings,
  shouldHoldEmbeddingIndex,
} from './core/rag/embeddingIndexHold'
import { EmbeddingIndexMutationQueue } from './core/rag/embeddingIndexQueue'
import {
  beginEmbeddingIndexRebuild,
  cancelEmbeddingIndexRebuild,
  completeEmbeddingIndexRebuild,
  failEmbeddingIndexRebuild,
  selectEmbeddingModel,
} from './core/rag/embeddingIndexState'
import { resolveLinkedMarkdownFile } from './core/rag/linkedMarkdown'
import { configureLocalE5, disposeLocalE5 } from './core/rag/localE5'
import { configureLocalE5Gpu } from './core/rag/localE5Gpu'
import { isLocalE5RuntimeInstalled } from './core/rag/localE5Runtime'
import { RAGEngine } from './core/rag/ragEngine'
import {
  type RelatedCandidate,
  type RelatedNote,
  discoverRelatedGraphRelations,
  extractRelatedFrontmatterReferences,
  groupIntoRelatedNotes,
  materializeRelatedGraphCandidates,
} from './core/rag/relatedNotes'
import {
  requestToolSemanticPreparation,
  semanticAvailability,
} from './core/rag/semanticPreparation'
import { SourceTextReader } from './core/rag/sourceTextReader'
import { DatabaseManager } from './database/DatabaseManager'
import { PGLiteAbortedException } from './database/exception'
import { JsonStorageService } from './database/json/JsonStorageService'
import {
  PostMigrationUiError,
  migrateToJsonDatabase,
} from './database/json/migrateToJsonDatabase'
import {
  DEFAULT_EMBEDDING_REBUILD_TIMEOUT_MS,
  type EmbeddingErrorKind,
  classifyEmbeddingError,
  isEmbeddingIndexAbortError,
} from './database/modules/vector/VectorManager'
import { t } from './i18n'
import { initModelLocale } from './i18n/modelLocale'
import { L } from './i18n/modelText'
import {
  VERBEX_CHAT_ICON,
  VERBEX_RELATED_ICON,
  registerVerbexIcons,
} from './icons'
import { existsSync, join, nodeProcess } from './platform/node/api'
import { PluginConnectorHost } from './provider/connectors/PluginConnectorHost'
import {
  VERBEX_CHAT_HOST_PROTOCOL_VERSION,
  VERBEX_PROVIDER_HOST_PROTOCOL_VERSION,
} from './provider/contract'
import type {
  ChatSubmissionResult,
  VerbexChatSubmissionOptions,
} from './provider/contract'
import {
  createBrowserRuntime,
  reviewBrowserOperations,
} from './provider/interop/browserRuntime'
import { queryBrowserStatus } from './provider/interop/browserStatus'
import { recoverPendingCommits } from './provider/interop/commitDisk'
import { CommitPolicyTracker } from './provider/interop/commitPolicy'
import { installDiagnosticRecording } from './provider/interop/diagnosticRecording'
import { NativeProviderHost } from './provider/interop/NativeProviderHost'
import { OutputAnchorCapture } from './provider/interop/outputAnchorCapture'
import {
  countPluginToolStates,
  projectPendingPluginApprovals,
  readManifestName,
} from './provider/interop/pendingPluginApprovals'
import { reportStylePorts } from './provider/interop/reportStylePorts'
import { isWebHandsEnabled } from './provider/interop/webHands'
import { saveMcpAutomaticApproval } from './provider/mcp/automaticApproval'
import { McpToolAdapter } from './provider/mcp/McpToolAdapter'
import { formatBinaryProposalApproval } from './provider/proposalApproval'
import { ProviderRegistry } from './provider/ProviderRegistry'
import { ToolProviderHub } from './provider/ToolProviderHub'
import { VerbexRelatedNotesView } from './RelatedView'
import { PluginRuntimeLifecycle } from './runtime/PluginRuntimeLifecycle'
import {
  createHwpHandsPrivacySource,
  setAiPrivateSource,
} from './security/aiPrivatePaths'
import { assertUserVaultPath } from './security/vaultPathPolicy'
import {
  hydrateProviderSecrets,
  migrateProviderKeysToKeychain,
  providerSecretStore,
  stripProviderSecrets,
} from './settings/providerSecrets'
import {
  VerbexSettings,
  verbexSettingsSchema,
} from './settings/schema/setting.types'
import { resolveLoadedSettings } from './settings/schema/settings'
import { VerbexSettingTab } from './settings/SettingTab'
import { VerbexStatusView } from './StatusView'
import {
  PluginReadinessSnapshot,
  PluginReadinessState,
  ReadinessStage,
  SearchIndexState,
  createReadinessStages,
} from './types/readiness'
import { trackApprovalWait } from './utils/approvalWait'
import { invalidateVaultFileMentionIndex } from './utils/chat/fileMentions'
import { dataEqual as isEqual } from './utils/dataEqual'
import { formatIndexProgressNotice, indexNoticeMs } from './utils/indexNotice'
import { collectProviderSecrets } from './utils/llm/redact'
import { createCl100kRanksLoader } from './utils/llm/tiktokenRanks'
import { registerTokenizerRanksLoader } from './utils/llm/token'
import { getMentionableBlockData } from './utils/obsidian'
import { StartupDiagnostics } from './utils/startupDiagnostics'
import { bootstrapVerbexWorkspace } from './verbex/bootstrap'
import { ChangeApproval } from './verbex/types'
import { VerbexController } from './VerbexController'

// Obsidian shows the plugin name next to each command; the shared labels keep it for other surfaces.
const commandName = (label: string): string => label.replace(/^Verbex:[ ]*/, '')

export type RelatedNotesBaseResult = {
  activeContent: string
  notes: RelatedNote[]
  bm25Candidates: RelatedCandidate[]
  graphCandidates: RelatedCandidate[]
}

class InitializationStageError extends Error {
  constructor(
    readonly stage: string,
    readonly causeError: unknown,
  ) {
    super(
      `${stage}: ${
        causeError instanceof Error ? causeError.message : String(causeError)
      }`,
    )
    this.name = 'InitializationStageError'
  }
}

export default class VerbexPlugin extends Plugin {
  private settingsFocus?: { section: 'tool-approval'; providerId: string }
  private settingsFocusListeners = new Set<() => void>()
  requestSettingsFocus(focus: {
    section: 'tool-approval'
    providerId: string
  }): void {
    this.settingsFocus = focus
    this.settingsFocusListeners.forEach((listener) => listener())
  }
  peekSettingsFocus() {
    return this.settingsFocus
  }
  clearSettingsFocus(): void {
    this.settingsFocus = undefined
  }
  onSettingsFocus(listener: () => void): () => void {
    this.settingsFocusListeners.add(listener)
    return () => {
      this.settingsFocusListeners.delete(listener)
    }
  }
  readonly api = {
    protocolVersion: VERBEX_PROVIDER_HOST_PROTOCOL_VERSION,
    providerRegistry: null as ProviderRegistry | null,
    chat: {
      protocolVersion: VERBEX_CHAT_HOST_PROTOCOL_VERSION,
      sendMessage: (message: string) => this.sendMessageToChat(message),
      sendMessageV2: (message: string, options?: VerbexChatSubmissionOptions) =>
        this.sendMessageToChatV2(message, options),
    },
  }
  toolProviderHub!: ToolProviderHub
  mcpToolAdapter!: McpToolAdapter
  pluginConnectorHost!: PluginConnectorHost
  private readonly scopedCommitPolicy = new CommitPolicyTracker()
  nativeProviderHost!: NativeProviderHost
  providerRegistry!: ProviderRegistry
  settings: VerbexSettings
  verbexController!: VerbexController
  jsonStorage!: JsonStorageService
  initialChatProps?: ChatProps // TODO: change this to use view state like ApplyView
  settingsChangeListeners: ((newSettings: VerbexSettings) => void)[] = []
  mcpManager: McpManager | null = null
  mcpOAuth!: McpOAuthService
  private mcpInitialization: Promise<McpManager> | null = null
  dbManager: DatabaseManager | null = null
  ragEngine: RAGEngine | null = null
  // Model discovery ("Fetch Models") session cache. One instance per plugin
  // load — never a module-level singleton — so results never leak across
  // vaults. See core/llm/modelDiscovery.ts.
  readonly modelDiscoveryCache: ModelDiscoveryCache =
    createModelDiscoveryCache()
  private dbManagerInitPromise: Promise<DatabaseManager> | null = null
  private ragEngineInitPromise: Promise<RAGEngine> | null = null
  private ragEngineInitializing = false
  private timeoutIds: number[] = []
  private pendingVaultIndexUpdate = false
  private embeddingIndexHold: EmbeddingErrorKind | null = null
  readonly embeddingIndexActivity = new EmbeddingIndexActivityStore()
  private runtimeMissingNotified = false
  private readonly openErrorModals = new Set<string>()
  private documentIndexing: DocumentIndexingControl | null = null
  private readonly backgroundScheduler = new BackgroundWorkScheduler({
    onError: (key, error) => {
      console.error(`Verbex background task failed (${key}):`, error)
    },
  })
  private readonly embeddingIndexQueue = new EmbeddingIndexMutationQueue()
  // Debounced queue for incremental BM25 (lexical) index updates. Kept separate
  // from the embedding index so BM25 search stays current without an LLM call.
  private lexicalIndexQueue: LexicalIndexUpdateQueue | null = null
  private readinessState: PluginReadinessState = 'initializing'
  private searchIndexState: SearchIndexState = 'ready'
  private readinessStages = createReadinessStages()
  private deferredInitError: Error | null = null
  private postMigrationUiError: Error | null = null
  private lexicalIndexSyncError: Error | null = null
  private deferredInitStarted = false
  // Closed first thing in onunload; see PluginRuntimeLifecycle.
  private readonly lifecycle = new PluginRuntimeLifecycle()
  private embeddingRebuildController: AbortController | null = null
  private embeddingRebuildPromise: Promise<void> | null = null
  private embeddingRebuildGeneration = 0
  private readonly relatedNotesReadyListeners = new Set<() => void>()
  private readonly startupDiagnostics = new StartupDiagnostics()
  private readonly startupEventCounts: Record<string, number> = {}
  private resolveWhenReady!: () => void
  readonly whenReady = new Promise<void>((resolve) => {
    this.resolveWhenReady = resolve
  })

  async onload() {
    initModelLocale()
    setAiPrivateSource(createHwpHandsPrivacySource(this.app))
    configureLocalE5Gpu(this.app, this.manifest.dir)
    const adapter = this.app.vault.adapter as { getBasePath?: () => string }
    if (adapter.getBasePath && this.manifest.dir) {
      configureLocalE5(join(adapter.getBasePath(), this.manifest.dir))
    }
    registerVerbexIcons()
    this.startupDiagnostics.mark('onload:start')
    console.debug(`[Verbex] ${formatVerbexBuildInfo()}`)
    await this.startupDiagnostics.measure('settings:load', () =>
      this.loadSettings(),
    )
    this.startupDiagnostics.mark('settings:loaded', {
      searchMode: this.settings.verbex.search.mode,
      providerCount: this.settings.providers.length,
      chatModelCount: this.settings.chatModels.length,
      skillsFolder: normalizePath(this.settings.skillsFolder),
      workflowsFolder: normalizePath(this.settings.workflowsFolder),
      promptsFolder: normalizePath(this.settings.promptsFolder),
    })
    this.jsonStorage = await this.startupDiagnostics.measure(
      'json-storage:create',
      () => JsonStorageService.create(this.app),
    )
    this.providerRegistry = new ProviderRegistry(this.app)
    this.providerRegistry.setBinaryProposalApprovalHandler((proposal) =>
      this.confirmBinaryProposal(proposal),
    )
    this.pluginConnectorHost = new PluginConnectorHost(
      this.app,
      () => this.settings.pluginConnectors.connectors,
      (id) => {
        const connectors = this.settings.pluginConnectors.connectors.map(
          (connector) =>
            connector.id === id
              ? { ...connector, approved: undefined }
              : connector,
        )
        void this.setSettings({
          ...this.settings,
          pluginConnectors: { connectors },
        }).catch((error) =>
          console.error('Connector approval revocation failed:', error),
        )
      },
    )
    this.mcpOAuth = new McpOAuthService(this.app, (url) => {
      window.open(url, '_blank', 'noopener')
    })
    this.mcpToolAdapter = new McpToolAdapter(
      () => this.getMcpManager('agent-tools'),
      (request, signal) => requestMcpApproval(this.app, request, signal),
      (name, identity) =>
        saveMcpAutomaticApproval(
          () => this.settings,
          (settings) => this.setSettings(settings),
          name,
          identity,
          (name) => readMcpSecret(this.app, name),
        ),
    )
    const commitCheckpoints = new ProviderCheckpointStore(this.app)
    const outputAnchorCapture = new OutputAnchorCapture()
    const commitLocks = new Set<string>()
    const commitLocked = (path: string) => commitLocks.has(path.toLowerCase())
    const browserRuntime = createBrowserRuntime(this.app, this.manifest.dir)
    this.addCommand({
      id: 'review-browser-operations',
      name: commandName(t('ui.main.reviewUnresolvedBrowserOperations')),
      checkCallback: (checking) => {
        if (!isWebHandsEnabled(this.app)) return false
        if (checking) return true
        void reviewBrowserOperations(this.app, browserRuntime, (record) =>
          queryBrowserStatus(
            this.nativeProviderHost.hostContext(),
            browserRuntime,
            record,
          ),
        )
        return true
      },
    })
    this.nativeProviderHost = new NativeProviderHost(
      this.app,
      () => this.settings.nativeProviders.providers,
      {
        selfId: this.manifest.id,
        browserRuntime,
        browserEffects: () => this.settings.nativeProviders.browserControl,
        vaultPath: (path) => assertUserVaultPath(this.app, path),
        // Working-copy edit tools are exposed by the user's 2026-10-15 decision
        // (docs/plans/hwp-plugin-role-redistribution-proposal-2026-10-15.md).
        // Each grant still asks a person; nothing is saved to a file.
        sessionEffects: true,
        approveSession: (request, signal) =>
          requestSessionEditApproval(this.app, request, signal),
        // Provider saves (commit tools) stay hidden until the Phase 2 gate and
        // the Phase 3 acceptance of the same plan have passed.
        commitEffects: false,
        outputAnchorCapture,
        documentJobBaseFontPt: () => this.settings.documentJobs.baseFontPt,
        documentJobBodyChoice: (request, signal) =>
          requestDocumentJobBodyChoice(this.app, request, signal),
        commitPolicy: () =>
          this.scopedCommitPolicy.read(
            this.settings.nativeProviders.commitGrants,
          ),
        commitRuntime: {
          outputAnchors: outputAnchorCapture.accept,
          outputAnchorRequested: outputAnchorCapture.requested,
          outputAnchorLeaseCurrent: outputAnchorCapture.leaseCurrent,
          outputAnchorLeaseLimit: outputAnchorCapture.limitLease,
          checkpoints: commitCheckpoints,
          locks: commitLocks,
          linkRun: (runId, checkpointId) =>
            this.verbexController.runLifecycle.linkCheckpoint(
              runId,
              checkpointId,
            ),
          approve: (request, signal) =>
            requestCommitApproval(this.app, request, signal),
        },
      },
    )
    installDiagnosticRecording(this, this.nativeProviderHost.diagnostics)
    this.providerRegistry.binaryPipeline.diagnostics =
      this.nativeProviderHost.diagnostics
    this.toolProviderHub = new ToolProviderHub(
      this.providerRegistry,
      this.pluginConnectorHost,
      this.app,
      this.mcpToolAdapter,
      this.nativeProviderHost,
    )
    this.api.providerRegistry = this.providerRegistry
    // Provider plugins may load before or after Verbex. The importer also
    // performs an immediate lookup; this event covers the Verbex-first case.
    this.app.workspace.trigger(
      'verbex:registry-ready',
      this.providerRegistry.generation,
    )
    this.verbexController = new VerbexController(
      this.app,
      this.settings,
      () => collectProviderSecrets(this.settings.providers),
      // Semantic/hybrid context: reuse the vector RAG engine (vector + BM25
      // fusion) when the configured search mode wants it. Returns null when the
      // engine can't be created so ContextBuilder falls back to lexical BM25.
      async () => {
        try {
          return await this.getRAGEngine('controller-semantic-provider')
        } catch {
          return null
        }
      },
      () => {
        const ragEngine = this.ragEngine
        return ragEngine?.isSemanticSearchReady() ? ragEngine : null
      },
      this.toolProviderHub,
      this.lifecycle,
      () => {
        const ragEngine = this.ragEngine
        return semanticAvailability({
          searchMode: this.settings.verbex.search.mode,
          engineStatus: ragEngine ? () => ragEngine.semanticStatus() : null,
          initializing: this.ragEngineInitializing,
        })
      },
      () =>
        requestToolSemanticPreparation({
          isActive: () => this.lifecycle.isActive,
          scheduler: this.backgroundScheduler,
          prepare: () => this.getRAGEngine('tool-semantic-demand'),
        }),
      () => this.settings.ragOptions.bm25Weight < 1,
    )
    this.verbexController.systemPromptBuilder.setPendingPluginApprovalsSource(
      () =>
        projectPendingPluginApprovals(
          this.nativeProviderHost.getStatuses(),
          (id) => readManifestName(this.app, id),
        ),
    )
    this.verbexController.statusSnapshotService.setPluginToolStatesSource(() =>
      countPluginToolStates(this.nativeProviderHost.getStatuses()),
    )
    this.register(
      this.nativeProviderHost.onStatusesChanged(() =>
        this.verbexController.statusSnapshotService.refreshPluginToolStates(),
      ),
    )
    this.verbexController.statusSnapshotService.observeEmbeddingActivity(
      this.embeddingIndexActivity,
    )
    this.verbexController.localTools.setReportStylePorts(
      reportStylePorts(this.app, this.nativeProviderHost.hostContext()),
    )
    this.verbexController.runLifecycle.dispatcher = new RunCheckpointDispatcher(
      this.app,
      this.verbexController.checkpointManager,
      commitCheckpoints,
      new BinaryCheckpointManager(this.app),
      commitLocked,
      (request) => requestTextRollbackApproval(this.app, request),
      {
        folders: () => this.settings,
        restored: (...paths) =>
          this.verbexController.catalogService.invalidateForPath(...paths),
      },
    )
    this.verbexController.lexicalIndex.setStartupDiagnostics(
      this.startupDiagnostics,
    )
    this.lexicalIndexQueue = new LexicalIndexUpdateQueue(
      {
        refresh: async () => {
          await this.verbexController.refreshLexicalIndex()
        },
        applyMutations: (mutations) =>
          this.verbexController.applyLexicalIndexMutations(mutations),
      },
      {
        scheduleFlush: () => {
          if (!this.lifecycle.isActive) return
          this.backgroundScheduler.schedule(
            'lexical-index',
            () => this.lexicalIndexQueue?.flushNow() ?? Promise.resolve(),
            1500,
          )
        },
        onError: (error) => {
          console.error(
            'Verbex: failed to update BM25 index from change',
            error,
          )
        },
      },
    )
    registerTokenizerRanksLoader(
      createCl100kRanksLoader(this.app, this.manifest.dir),
    )
    this.wireDiffApproval()

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))
    this.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))
    this.registerView(
      STATUS_VIEW_TYPE,
      (leaf) => new VerbexStatusView(leaf, this),
    )
    this.registerView(
      RELATED_VIEW_TYPE,
      (leaf) => new VerbexRelatedNotesView(leaf, this),
    )

    // This creates an icon in the left ribbon.
    this.addRibbonIcon(VERBEX_CHAT_ICON, 'Open Verbex chat', () =>
      this.openChatView(),
    )
    this.addRibbonIcon('list-checks', 'Open Verbex status', () =>
      this.openStatusView(),
    )
    this.addRibbonIcon(VERBEX_RELATED_ICON, 'Open Related Notes', () =>
      this.openRelatedNotesView(),
    )

    // This adds a simple command that can be triggered anywhere
    this.addCommand({
      id: 'open-chat',
      name: commandName(t('ui.main.verbexOpenChat')),
      callback: () => this.openChatView(true),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: commandName(t('ui.main.verbexAddSelectionToChat')),
      editorCallback: (editor: Editor, view: MarkdownView) => {
        void this.addSelectionToChat(editor, view)
      },
    })

    this.addCommand({
      id: 'open-status',
      name: commandName(t('ui.main.verbexShowStatus')),
      callback: () => this.openStatusView(),
    })

    this.addCommand({
      id: 'open-related-notes',
      name: commandName(t('ui.main.verbexShowRelatedNotes')),
      callback: () => this.openRelatedNotesView(),
    })

    this.addCommand({
      id: 'index-refresh',
      name: commandName(t('ui.main.verbexUpdateIndex')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        this.releaseEmbeddingIndexHold()
        const notice = new Notice(t('notices.index.rebuilding'), 0)
        let failed = false
        try {
          await this.verbexController.refreshLexicalIndex()
          // A pending model switch keeps the previous model active for
          // fallback retrieval. An explicit full rebuild must nevertheless
          // use the model selected in Settings, not that retained active
          // model.
          if (this.shouldScheduleEmbeddingIndexUpdate())
            await this.rebuildEmbeddingIndex(
              this.settings.embeddingModelId,
              (indexProgress) => {
                notice.setMessage(formatIndexProgressNotice(indexProgress))
              },
            )
          notice.setMessage(t('notices.index.rebuilt'))
        } catch (error) {
          console.error(error)
          failed = true
          if (this.lifecycle.isActive)
            notice.setMessage(
              `${t('notices.index.embeddingFailed')}\n${error instanceof Error ? error.message : String(error)}`,
            )
        } finally {
          this.registerTimeout(() => notice.hide(), indexNoticeMs(failed))
        }
      },
    })

    this.addCommand({
      id: 'index-update-modified',
      name: commandName(t('ui.main.verbexUpdateModifiedFileIndex')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        this.releaseEmbeddingIndexHold()
        const notice = new Notice(t('notices.index.updating'), 0)
        let failed = false
        try {
          await this.verbexController.refreshLexicalIndex()
          if (this.shouldScheduleEmbeddingIndexUpdate()) {
            const ragEngine = await this.getRAGEngine(
              'explicit-index-update-modified',
            )
            await ragEngine.updateVaultIndex(
              { reindexAll: false, source: 'manual' },
              (queryProgress) => {
                if (queryProgress.type === 'indexing') {
                  notice.setMessage(
                    formatIndexProgressNotice(queryProgress.indexProgress),
                  )
                }
              },
            )
          }
          notice.setMessage(t('notices.index.updated'))
        } catch (error) {
          console.error(error)
          failed = true
          if (this.lifecycle.isActive)
            notice.setMessage(
              classifyEmbeddingError(error) === 'runtime_missing'
                ? `${t('notices.index.embeddingFailed')}\n${error instanceof Error ? error.message : String(error)}`
                : t('notices.index.embeddingFailed'),
            )
        } finally {
          this.registerTimeout(() => notice.hide(), indexNoticeMs(failed))
        }
      },
    })

    this.addCommand({
      id: 'context',
      name: t('ui.main.contextPreview'),
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (!(await this.ensureReady())) return
        const selectedText = editor.getSelection()
        const currentLine = editor.getLine(editor.getCursor().line)
        const query = selectedText.trim()
          ? selectedText
          : currentLine.trim()
            ? currentLine
            : (view.file?.basename ?? '')
        if (!query.trim()) {
          new Notice(t('notices.context.noQuery'))
          return
        }
        try {
          const context = await this.verbexController.buildContext(
            query,
            view.file,
          )
          if (!this.lifecycle.isActive) return
          await this.openStatusView()
          console.debug('[Verbex] Context\n', context)
          new Notice(
            t('notices.context.built', { count: context.items.length }),
          )
        } catch (error) {
          console.error(error)
          new Notice(t('notices.context.failed'))
        }
      },
    })

    this.addCommand({
      id: 'skills',
      name: commandName(t('ui.main.verbexRefreshSkillList')),
      callback: async () => {
        await this.whenReady
        await this.verbexController.refresh()
        const summary = this.verbexController.getSkillsSummary()
        console.debug('[Verbex] Skills\n' + summary)
        new Notice(
          summary
            ? 'Verbex skills refreshed. See console for details.'
            : 'No Verbex skills found.',
        )
      },
    })

    this.addCommand({
      id: 'plan',
      name: commandName(t('ui.main.verbexShowCurrentPlan')),
      callback: async () => {
        await this.openStatusView()
        console.debug(
          '[Verbex] Plan\n' + this.verbexController.getPlanSummary(),
        )
      },
    })

    this.addCommand({
      id: 'stop',
      name: commandName(t('ui.main.verbexStopRun')),
      callback: async () => {
        const run = await this.verbexController.pauseActiveRun()
        new Notice(
          run ? `Verbex run paused: ${run.id}` : 'No active Verbex run.',
        )
      },
    })

    this.addCommand({
      id: 'resume',
      name: commandName(t('ui.main.verbexResumeRun')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        const run = await this.verbexController.resumeRun()
        await this.openStatusView()
        new Notice(
          run
            ? `Verbex run resumed: ${run.id} (${run.status})`
            : 'No resumable Verbex run found.',
        )
      },
    })

    this.addCommand({
      id: 'agent-run',
      name: commandName(t('ui.main.verbexRunAgentOnSelectionToolCalling')),
      editorCallback: async (editor: Editor) => {
        if (!(await this.ensureReady())) return
        const request =
          editor.getSelection() || editor.getLine(editor.getCursor().line)
        if (!request.trim()) {
          new Notice(t('ui.main.selectTheRequestTextToSendTo'))
          return
        }
        new Notice(t('ui.main.startingVerbexAgent'))
        try {
          // Tell the agent which note is under review (plus its folder) so it can
          // scan sibling notes for cross-document consistency. Skill selection is
          // LLM-driven in the chat; this command runs the agent without a
          // pre-selected skill (the system prompt still surfaces vault skills).
          const currentFile = this.app.workspace.getActiveFile()
          const agentRequest = currentFile
            ? L({
                ko: `검토 대상 노트: ${currentFile.path}\n폴더: ${currentFile.parent?.path ?? '/'}\n같은 폴더의 다른 노트와의 일관성도 점검하세요.\n\n${request}`,
                en: `Note to review: ${currentFile.path}\nFolder: ${currentFile.parent?.path ?? '/'}\nAlso check consistency with other notes in the same folder.\n\n${request}`,
              })
            : request
          this.refreshProviderSecrets()
          const result = await this.verbexController.runAgent({
            runId: `agent-${Date.now()}`,
            request: agentRequest,
            currentFile,
            skillInstructions: null,
          })
          if (!this.lifecycle.isActive) return
          new Notice(
            t('ui.main.verbexAgentToolCallsTurns', {
              p0:
                result.stoppedReason === 'completed'
                  ? t('ui.main.completed')
                  : t('ui.main.iterationLimitReached'),
              p1: result.toolCalls.length,
              p2: result.iterations,
            }),
          )
        } catch (error) {
          if (!this.lifecycle.isActive) return
          new Notice(
            t('ui.main.verbexAgentError', {
              p0: error instanceof Error ? error.message : String(error),
            }),
          )
        }
        await this.openStatusView()
      },
    })

    this.addCommand({
      id: 'inline-continue',
      name: commandName(t('ui.main.verbexContinueWritingAtCursor')),
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.inlineContinue(editor, view)
      },
    })

    this.addCommand({
      id: 'inline-rewrite',
      name: commandName(t('ui.main.verbexRewriteSelection')),
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.inlineRewrite(editor, view)
      },
    })

    this.addCommand({
      id: 'rollback',
      name: commandName(t('restoreActiveRunCommand')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        const result = await this.verbexController.rollbackRun()
        await this.openStatusView()
        const report = result?.report
        const kept = report ? report.skipped.length + report.failed.length : 0
        new Notice(
          !result
            ? t('ui.main.noCheckpointsToRestore')
            : kept && report
              ? t('ui.main.verbexRollbackRestoredSkippedFailedSkippedFiles', {
                  p0: result.runId,
                  p1: report.restored.length,
                  p2: report.skipped.length,
                  p3: report.failed.length,
                  p4: [...report.skipped, ...report.failed]
                    .map((item) => item.path)
                    .join(', '),
                })
              : t('ui.main.verbexRestoredToCheckpoint', {
                  p0: result.runId,
                  p1: result.checkpointId,
                }),
          kept ? 0 : undefined,
        )
      },
    })

    this.addCommand({
      id: 'checkpoints',
      name: commandName(t('ui.main.verbexListCheckpoints')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        new CheckpointRunsModal(
          this.app,
          this.verbexController,
          this.jsonStorage.chatManager,
        ).open()
      },
    })

    this.addCommand({
      id: 'auto-toggle',
      name: commandName(t('ui.main.verbexToggleAutoMode')),
      callback: () => {
        const enabled = this.verbexController.toggleAutoMode()
        new Notice(
          enabled
            ? t('ui.main.autoModeOn', {
                p0: this.settings.verbex.permissions.autoModeTimeoutSeconds,
                p1: this.settings.verbex.permissions.autoModeExclude.join('/'),
              })
            : t('ui.main.autoModeOff'),
        )
      },
    })

    this.addCommand({
      id: 'checkpoints-clean',
      name: commandName(t('ui.main.verbexCleanUpCheckpointsRetentionPolicy')),
      callback: async () => {
        if (!(await this.ensureReady())) return
        const { removed, freedBytes } =
          await this.verbexController.cleanCheckpoints()
        new Notice(
          removed > 0
            ? t('ui.main.verbexRemovedCheckpointsFreedKB', {
                p0: removed,
                p1: Math.round(freedBytes / 1024),
              })
            : t('ui.main.noExpiredCheckpointsToCleanUp'),
        )
      },
    })

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new VerbexSettingTab(this.app, this))
    this.setReadinessStage('ui', 'ready')
    this.lifecycle.markRunning()
    this.app.workspace.onLayoutReady(() => {
      if (!this.lifecycle.isActive) return
      this.startupDiagnostics.mark('workspace:layout-ready')
      void this.nativeProviderHost.refresh()
      // A save that was cut off by a restart is settled from disk, never re-run.
      void recoverPendingCommits(this.app, commitCheckpoints, commitLocked)
      void this.deferredInit()
    })
    this.startupDiagnostics.mark('onload:end')
    this.startupDiagnostics.scheduleSummary(() => ({
      readinessState: this.readinessState,
      searchIndexState: this.searchIndexState,
      eventCounts: { ...this.startupEventCounts },
    }))
  }

  recordStartupDiagnostic(
    event: string,
    fields: Record<string, unknown> = {},
  ): void {
    this.startupDiagnostics.mark(event, fields)
  }

  async ensureReady(options: { notify?: boolean } = {}): Promise<boolean> {
    await this.whenReady
    if (!this.lifecycle.isActive) return false
    const ready = this.readinessState === 'ready'
    if (!ready && options.notify !== false) {
      new Notice(this.getReadinessErrorMessage(), 0)
    }
    return ready
  }

  /** False once unload started; late continuations must not touch UI/editor. */
  get isRuntimeActive(): boolean {
    return this.lifecycle.isActive
  }

  /** Run independent (non-agent) work under the unload signal. */
  runPluginWork<T>(
    callerSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    return this.lifecycle.runWork(callerSignal, operation)
  }

  getReadinessSnapshot(): PluginReadinessSnapshot {
    return {
      readinessState: this.readinessState,
      searchIndexState: this.searchIndexState,
      stages: structuredClone(this.readinessStages),
      initializationError: this.deferredInitError?.message ?? null,
      postMigrationUiError: this.postMigrationUiError?.message ?? null,
      lexicalIndexSyncError: this.lexicalIndexSyncError?.message ?? null,
    }
  }

  private setReadinessStage(
    stage: ReadinessStage,
    state: (typeof this.readinessStages)[ReadinessStage]['state'],
    error: string | null = null,
  ): void {
    if (!this.lifecycle.isActive) return
    this.readinessStages = {
      ...this.readinessStages,
      [stage]: { state, error },
    }
    this.startupDiagnostics.mark(`readiness:${stage}`, { state, error })
  }

  private async runReadinessStage<T>(
    stage: ReadinessStage,
    name: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    this.setReadinessStage(stage, 'pending')
    try {
      const result = await this.runInitStage(name, operation)
      this.setReadinessStage(stage, 'ready')
      return result
    } catch (error) {
      this.setReadinessStage(
        stage,
        'failed',
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  private getReadinessErrorMessage(): string {
    if (this.postMigrationUiError) {
      return `Verbex migration completed, but the chat view could not reload: ${this.postMigrationUiError.message}. Reload Obsidian before submitting.`
    }
    return `Verbex initialization failed: ${this.deferredInitError?.message ?? 'unknown error'}`
  }

  private async runInitStage<T>(
    stage: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    return this.startupDiagnostics.measure(stage, async () => {
      this.lifecycle.assertActive()
      let result: T
      try {
        result = await operation()
      } catch (error) {
        throw new InitializationStageError(stage, error)
      }
      // A stage that finished after unload must not let startup continue.
      this.lifecycle.assertActive()
      return result
    })
  }

  /**
   * Probe the folders used by the skill/workflow catalog after bootstrap.
   * Catalog discovery is intentionally adapter-based, so this gives us the
   * exact vault-relative paths and direct entries seen by the runtime on each
   * machine without exposing file contents or secrets.
   */
  private async probeAgentCatalogFolders(): Promise<void> {
    const folders = [
      { kind: 'skills', path: this.settings.skillsFolder },
      { kind: 'workflows', path: this.settings.workflowsFolder },
      { kind: 'prompts', path: this.settings.promptsFolder },
    ] as const
    const results = await Promise.all(
      folders.map(async ({ kind, path }) => {
        const normalizedPath = normalizePath(path?.trim() ?? '')
        try {
          const exists = await this.app.vault.adapter.exists(normalizedPath)
          if (!exists) {
            return { kind, path: normalizedPath, exists: false }
          }
          const listed = await this.app.vault.adapter.list(normalizedPath)
          return {
            kind,
            path: normalizedPath,
            exists: true,
            directFileCount: listed.files?.length ?? 0,
            directFolderCount: listed.folders?.length ?? 0,
            directFiles: (listed.files ?? []).map(normalizePath),
            directFolders: (listed.folders ?? []).map(normalizePath),
          }
        } catch (error) {
          return {
            kind,
            path: normalizedPath,
            exists: null,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }),
    )
    this.startupDiagnostics.mark('agent-catalog:folders', { folders: results })
  }

  private async deferredInit() {
    if (this.deferredInitStarted) return
    this.deferredInitStarted = true
    try {
      await this.runInitStage('workspace bootstrap', () =>
        bootstrapVerbexWorkspace(
          this.app,
          this.settings.skillsFolder,
          this.settings.workflowsFolder,
          this.settings.promptsFolder,
        ),
      )
      await this.runReadinessStage('catalog', 'agent catalog probe', () =>
        this.probeAgentCatalogFolders(),
      )
      await this.runReadinessStage('catalog', 'status refresh', () =>
        this.verbexController.refresh(),
      )

      try {
        await this.runInitStage('JSON storage migration', () =>
          this.migrateToJsonStorage(),
        )
      } catch (error) {
        const cause: unknown =
          error instanceof InitializationStageError ? error.causeError : error
        if (cause instanceof PostMigrationUiError) {
          this.postMigrationUiError = cause
        } else {
          throw error
        }
      }

      await this.runInitStage('vault event registration', () => {
        this.registerVaultIndexEventHandlers()
      })
      await this.runReadinessStage('lexical', 'BM25 reconcile', () =>
        this.reconcileLexicalIndexAfterStartup(),
      )
      if (this.searchIndexState !== 'ready') {
        this.setReadinessStage(
          'lexical',
          this.searchIndexState,
          this.lexicalIndexSyncError?.message ?? null,
        )
      }
      this.lifecycle.assertActive()
      this.readinessState = this.postMigrationUiError
        ? 'post_migration_ui_failed'
        : 'ready'
    } catch (error) {
      // Shutdown interrupted startup: not an initialization failure.
      if (!this.lifecycle.isActive) return
      const stageError =
        error instanceof InitializationStageError
          ? error
          : new InitializationStageError('deferred initialization', error)
      this.deferredInitError = stageError
      this.readinessState = 'init_failed'
      console.error('Verbex deferred initialization failed:', stageError)
      new Notice(
        t('ui.main.verbexInitializationFailedChatRunsAreBlocked', {
          p0: stageError.message,
        }),
        0,
      )
    } finally {
      this.resolveWhenReady()
      if (this.lifecycle.isActive)
        this.startupDiagnostics.mark('ready', {
          readinessState: this.readinessState,
          searchIndexState: this.searchIndexState,
          eventCounts: { ...this.startupEventCounts },
        })
      if (this.lifecycle.isActive && this.readinessState === 'ready') {
        void this.notifyResumableRuns()
      }
    }
  }

  // Detect runs that did not finish in the previous session and guide the
  // user to resume them from the status view.
  private async notifyResumableRuns() {
    try {
      const resumable = await this.verbexController.getResumableRuns()
      if (!this.lifecycle.isActive) return
      const unreadable = this.verbexController.getUnreadableRunCount()
      if (unreadable > 0) {
        new Notice(
          `Verbex: ${unreadable} unreadable run record(s) were skipped and not resumed. Files are kept.`,
          8000,
        )
      }
      if (resumable.length > 0) {
        new Notice(
          `Verbex: ${resumable.length} unfinished run(s) detected. Open the status view to resume.`,
          5000,
        )
      }
    } catch (error) {
      console.error('Failed to check for resumable Verbex runs:', error)
    }
  }

  onunload(): void
  async onunload() {
    setAiPrivateSource(null)
    disposeLocalE5()
    // Close the gate before the first await so nothing new can start while
    // cleanup below runs. Cleanup itself is not a business operation.
    this.lifecycle.stop()
    // Index work is business work: drop queued tasks before the first await so
    // the scheduler timer cannot start them during cleanup.
    this.backgroundScheduler.cancel('lexical-index')
    this.backgroundScheduler.cancel('embedding-index')
    // Best-effort: mark the active run as paused so it is detected and
    // offered for resume on next load, before releasing document leases.
    await this.verbexController?.pauseActiveRun().catch((error) => {
      console.error('Failed to pause active Verbex run on unload:', error)
    })
    this.pluginConnectorHost?.dispose()
    for (const conversationId of [
      ...(this.nativeProviderHost?.activeConversations ?? []),
    ])
      await this.nativeProviderHost?.releaseDocuments(conversationId)
    this.nativeProviderHost?.dispose()
    this.mcpToolAdapter?.dispose()
    this.mcpOAuth?.dispose()
    this.providerRegistry?.dispose()
    this.api.providerRegistry = null

    // clear all timers
    this.timeoutIds.forEach((id) => window.clearTimeout(id))
    this.timeoutIds = []
    this.lexicalIndexQueue?.dispose()
    this.lexicalIndexQueue = null
    this.resolveWhenReady()

    // Let lazy initialization settle so a just-created database is also
    // closed. Then cancel indexing and wait for its final database save before
    // releasing the database connection.
    await this.ragEngineInitPromise?.catch((error) => {
      console.error('RAG engine initialization failed during unload:', error)
    })
    await this.dbManagerInitPromise?.catch((error) => {
      console.error('Database initialization failed during unload:', error)
    })
    await this.cancelEmbeddingIndexRebuild()
    await this.ragEngine?.cancelIndexing()

    this.ragEngine?.cleanup()
    this.ragEngine = null
    this.ragEngineInitPromise = null

    try {
      await this.dbManager?.cleanup()
    } catch (error) {
      console.error('Database cleanup failed during unload:', error)
    }
    this.dbManager = null
    this.dbManagerInitPromise = null

    this.backgroundScheduler.dispose()

    // McpManager cleanup
    this.mcpManager?.cleanup()
    this.mcpManager = null

    this.modelDiscoveryCache.entries.clear()
    this.startupDiagnostics.dispose()
    this.lifecycle.markStopped()
  }

  private confirmBinaryProposal(
    proposal: import('./provider/contract').BinaryProposalSummary,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let decision: boolean | null = null
      const modal = new ConfirmModal(this.app, {
        title: t('ui.main.approveHWPXBinaryChanges'),
        message: formatBinaryProposalApproval(proposal),
        ctaText: t('ui.main.approveAllProposalsAndSave'),
        onConfirm: () => {
          decision = true
        },
        onCancel: () => {
          decision = false
        },
      })
      const closeModal = modal.onClose.bind(modal) as () => void
      modal.onClose = () => {
        closeModal()
        queueMicrotask(() => resolve(decision ?? false))
      }
      modal.open()
    })
  }

  async loadSettings() {
    const rawSettings: unknown = await this.loadData()
    const loaded = initialSearchSettings(
      resolveLoadedSettings(rawSettings),
      rawSettings,
      this.isLocalEmbeddingRuntimeInstalled(),
    )
    const store = providerSecretStore(this.app)
    const migration = store
      ? migrateProviderKeysToKeychain(loaded, store)
      : { settings: loaded, migrated: [], failed: [] }
    const persisted = stripProviderSecrets(migration.settings)
    const shouldPersistSettings =
      rawSettings == null || !isEqual(rawSettings, persisted)
    this.startupDiagnostics.mark('settings:initial-save', {
      loadedExisting: rawSettings != null,
      saved: shouldPersistSettings,
    })
    if (shouldPersistSettings) {
      await this.saveProviderSettings(persisted)
    }
    this.settings = hydrateProviderSecrets(migration.settings, store)
    if (migration.migrated.length)
      new Notice(
        t('settings.providers.migrationDone', {
          count: migration.migrated.length,
        }),
      )
    if (migration.failed.length)
      new Notice(
        t('settings.providers.migrationFailed', {
          ids: migration.failed.join(', '),
        }),
      )
  }

  private async saveProviderSettings(settings: VerbexSettings) {
    await this.saveData(stripProviderSecrets(settings))
  }

  refreshProviderSecrets(): boolean {
    const settings = hydrateProviderSecrets(
      this.settings,
      providerSecretStore(this.app),
    )
    if (
      settings.providers.every(
        (provider, index) =>
          provider.apiKey === this.settings.providers[index].apiKey,
      )
    )
      return false
    this.settings = settings
    this.ragEngine?.setSettings(settings)
    this.verbexController?.setSettings(settings)
    this.releaseEmbeddingIndexHold()
    this.settingsChangeListeners.forEach((listener) => listener(settings))
    return true
  }

  async setSettings(newSettings: VerbexSettings) {
    const validationResult = verbexSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(
        t('ui.main.invalidSettings', {
          p0: validationResult.error.issues.map((v) => v.message).join('\n'),
        }),
      )
      return
    }

    const validatedSettings = hydrateProviderSecrets(
      validationResult.data,
      providerSecretStore(this.app),
    )
    const releaseHold = embeddingSettingsChanged(
      this.settings,
      validatedSettings,
    )
    const embeddingModelChanged =
      this.settings.embeddingModelId !== validatedSettings.embeddingModelId
    if (embeddingModelChanged) {
      this.embeddingRebuildGeneration += 1
      this.embeddingRebuildController?.abort()
    }
    const settingsToSave = embeddingModelChanged
      ? {
          ...validatedSettings,
          embeddingIndexState: selectEmbeddingModel(
            this.settings,
            validatedSettings.embeddingModelId,
          ),
        }
      : validatedSettings
    const shouldReindex = this.shouldScheduleVaultIndexUpdateForSettings(
      this.settings,
      settingsToSave,
    )
    const shouldRebuildLexicalIndex =
      this.shouldScheduleLexicalIndexUpdateForSettings(
        this.settings,
        settingsToSave,
      )
    this.scopedCommitPolicy.observe(settingsToSave.nativeProviders.commitGrants)
    this.settings = settingsToSave
    await this.saveProviderSettings(settingsToSave)
    this.ragEngine?.setSettings(settingsToSave)
    if (releaseHold) this.releaseEmbeddingIndexHold()
    if (this.ragEngine?.isSemanticSearchReady()) {
      for (const listener of this.relatedNotesReadyListeners) {
        listener()
      }
    }
    this.verbexController?.setSettings(settingsToSave)
    this.settingsChangeListeners.forEach((listener) => listener(settingsToSave))
    if (shouldReindex) {
      if (settingsToSave.verbex.search.mode !== 'bm25') {
        this.scheduleVaultIndexUpdate()
      } else {
        this.cancelPendingVaultIndexUpdate()
      }
    }
    if (shouldRebuildLexicalIndex) {
      if (this.documentIndexing) {
        this.documentIndexing.requestReconcile()
      } else {
        this.backgroundScheduler.schedule('document-extraction', async () => {
          await reconcileDocuments(this.app, this.settings)
          this.scheduleLexicalIndexRefresh()
        })
      }
      this.scheduleLexicalIndexRefresh()
    }
  }

  private async persistEmbeddingIndexState(
    embeddingIndexState: VerbexSettings['embeddingIndexState'],
  ) {
    const settings = { ...this.settings, embeddingIndexState }
    this.scopedCommitPolicy.observe(settings.nativeProviders.commitGrants)
    this.settings = settings
    await this.saveProviderSettings(settings)
    this.ragEngine?.setSettings(settings)
    if (embeddingIndexState?.phase === 'ready') {
      this.ragEngine?.markEmbeddingIndexReady()
    }
    this.verbexController?.setSettings(settings)
    this.settingsChangeListeners.forEach((listener) => listener(settings))
  }

  isEmbeddingIndexRebuildRunning(): boolean {
    return this.embeddingRebuildPromise !== null
  }

  async cancelEmbeddingIndexRebuild(): Promise<void> {
    this.embeddingRebuildController?.abort()
    await this.embeddingRebuildPromise?.catch(() => undefined)
  }

  async rebuildEmbeddingIndex(
    modelId: string = this.settings.embeddingModelId,
    onProgress?: (progress: IndexProgress) => void,
  ): Promise<void> {
    if (this.embeddingRebuildPromise) {
      throw new Error('An embedding index rebuild is already in progress.')
    }

    const embeddingModel = getEmbeddingModelClient({
      settings: this.settings,
      embeddingModelId: modelId,
    })
    const generation = ++this.embeddingRebuildGeneration
    const controller = new AbortController()
    this.embeddingRebuildController = controller
    const shouldActivateTarget = modelId === this.settings.embeddingModelId
    let runPromise: Promise<void> | null = null

    const run = async () => {
      let rebuildState: Extract<
        NonNullable<VerbexSettings['embeddingIndexState']>,
        { phase: 'rebuilding' }
      > | null = null
      try {
        if (shouldActivateTarget) {
          rebuildState = beginEmbeddingIndexRebuild(this.settings, modelId)
          await this.persistEmbeddingIndexState(rebuildState)
        }

        const ragEngine = await this.getRAGEngine('explicit-embedding-rebuild')
        await ragEngine.rebuildEmbeddingIndex(
          embeddingModel,
          (indexProgress) => onProgress?.(indexProgress),
          {
            signal: controller.signal,
            timeoutMs: DEFAULT_EMBEDDING_REBUILD_TIMEOUT_MS,
          },
        )

        // VectorManager's normal save callback is debounced. A rebuild must
        // finish the durable DB dump before the model is promoted to active.
        await (await this.getDbManager('embedding-rebuild-save')).save()

        if (
          shouldActivateTarget &&
          generation === this.embeddingRebuildGeneration &&
          rebuildState &&
          this.settings.embeddingIndexState?.phase === 'rebuilding' &&
          this.settings.embeddingIndexState.targetModelId === modelId
        ) {
          await this.persistEmbeddingIndexState(
            completeEmbeddingIndexRebuild(rebuildState),
          )
          new Notice(t('ui.main.embeddingIndexReady', { p0: modelId }))
        }
      } catch (error) {
        const timedOut =
          error instanceof Error && /timed?\s*out/i.test(error.message)
        const aborted =
          controller.signal.aborted || isEmbeddingIndexAbortError(error)
        if (
          shouldActivateTarget &&
          generation === this.embeddingRebuildGeneration &&
          rebuildState &&
          this.settings.embeddingIndexState?.phase === 'rebuilding' &&
          this.settings.embeddingIndexState.targetModelId === modelId
        ) {
          try {
            await this.persistEmbeddingIndexState(
              aborted && !timedOut
                ? cancelEmbeddingIndexRebuild(rebuildState)
                : failEmbeddingIndexRebuild(
                    rebuildState,
                    error instanceof Error ? error.message : String(error),
                  ),
            )
          } catch (persistError) {
            console.error(
              'Failed to persist embedding index rebuild state:',
              persistError,
            )
          }
        }
        throw error
      } finally {
        if (this.embeddingRebuildController === controller) {
          this.embeddingRebuildController = null
        }
        if (this.embeddingRebuildPromise === runPromise) {
          this.embeddingRebuildPromise = null
        }
      }
    }

    runPromise = run()
    this.embeddingRebuildPromise = runPromise
    return runPromise
  }

  addSettingsChangeListener(listener: (newSettings: VerbexSettings) => void) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      void this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    void this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  /**
   * Public companion-plugin bridge. It deliberately submits through ChatView
   * rather than calling the controller directly, so the normal chat readiness,
   * tool, approval, and persistence paths remain authoritative.
   */
  private async sendMessageToChat(message: string): Promise<boolean> {
    const result = await this.sendMessageToChatV2(message)
    return result.status === 'submitted'
  }

  private async sendMessageToChatV2(
    message: string,
    options?: VerbexChatSubmissionOptions,
  ): Promise<ChatSubmissionResult> {
    const normalized = message.trim()
    if (!normalized) return { status: 'rejected', reason: 'Message is empty.' }

    let leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
    let chatView = leaf?.view instanceof ChatView ? leaf.view : undefined
    if (!chatView) {
      await this.activateChatView()
      leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
      chatView = leaf?.view instanceof ChatView ? leaf.view : undefined
    }
    if (!chatView || !leaf) {
      throw new Error(t('ui.main.cannotOpenTheVerbexChatView'))
    }

    void this.app.workspace.revealLeaf(leaf)
    return await chatView.sendMessageV2(normalized, options)
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    // chatProps is consumed in ChatView.tsx
    this.initialChatProps = chatProps

    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    void this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  // Connect the StepExecutor's approval gate to the Diff review modal. Each
  // change that needs review opens a VerbexDiffModal and the user's per-hunk
  // decision flows back as a ChangeApproval.
  private wireDiffApproval() {
    this.verbexController.stepExecutor.setApprovalHandler(
      ({ change, decision, blocks }) =>
        trackApprovalWait(
          new Promise<ChangeApproval>((resolve) => {
            const timeout =
              decision.action === 'auto_apply'
                ? this.settings.verbex.permissions.autoModeTimeoutSeconds
                : null
            new VerbexDiffModal(
              this.app,
              change,
              decision,
              blocks,
              timeout,
              resolve,
            ).open()
          }),
        ),
    )

    // Multi-file review: several changes in one turn are approved together.
    this.verbexController.stepExecutor.setBatchApprovalHandler((requests) =>
      trackApprovalWait(
        new Promise<ChangeApproval[]>((resolve) => {
          new VerbexBatchDiffModal(this.app, requests, resolve).open()
        }),
      ),
    )
  }

  async openStatusView() {
    await this.whenReady
    const leaf = this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: STATUS_VIEW_TYPE,
      active: true,
    })

    await this.verbexController.refresh({ embeddingStats: 'eager' })
    void this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE)[0],
    )
  }

  async openRelatedNotesView() {
    const leaf = this.app.workspace.getLeavesOfType(RELATED_VIEW_TYPE)[0]
    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: RELATED_VIEW_TYPE,
      active: true,
    })
    const relatedLeaf = this.app.workspace.getLeavesOfType(RELATED_VIEW_TYPE)[0]
    if (relatedLeaf) void this.app.workspace.revealLeaf(relatedLeaf)
  }

  addRAGReadyListener(listener: () => void): () => void {
    this.relatedNotesReadyListeners.add(listener)
    return () => this.relatedNotesReadyListeners.delete(listener)
  }

  async getRelatedNotesBase(input: {
    activePath: string
    limit?: number
    signal?: AbortSignal
  }): Promise<RelatedNotesBaseResult> {
    const file = this.app.vault.getFileByPath(input.activePath)
    const activeContent = file
      ? file.extension === 'md'
        ? await this.app.vault.cachedRead(file)
        : (await new SourceTextReader(this.app).read(file.path))?.text
      : null
    if (!file || activeContent == null) {
      return {
        activeContent: '',
        notes: [],
        bm25Candidates: [],
        graphCandidates: [],
      }
    }
    const limit = Math.max(
      0,
      Math.floor(input.limit ?? this.settings.verbex.relatedNotes.limit),
    )
    if (limit === 0) {
      return {
        activeContent,
        notes: [],
        bm25Candidates: [],
        graphCandidates: [],
      }
    }
    const lexicalResults = await this.verbexController.lexicalIndex.search(
      activeContent,
      Math.max(limit * 4, 20),
      input.signal,
    )
    const bm25Candidates: RelatedCandidate[] = lexicalResults
      .filter((result) => result.path && result.path !== input.activePath)
      .map((result) => ({
        path: result.path,
        title: result.title,
        snippet: result.snippet,
        source: 'bm25',
        score: result.score,
      }))
    const graphCandidates = await this.getRelatedGraphCandidates(
      file,
      activeContent,
      limit,
      input.signal,
    )
    return {
      activeContent,
      notes: groupIntoRelatedNotes([], bm25Candidates, graphCandidates, {
        activePath: input.activePath,
        limit,
        excludePath: dailyNoteExclusion(
          this.app,
          this.settings.verbex.relatedNotes.excludeDailyNotes,
        ),
      }),
      bm25Candidates,
      graphCandidates,
    }
  }

  private async getRelatedGraphCandidates(
    activeFile: TFile,
    activeContent: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<RelatedCandidate[]> {
    if (activeFile.extension !== 'md') return []
    const markdownFiles = this.app.vault.getMarkdownFiles()
    const activeCache = this.app.metadataCache?.getFileCache?.(activeFile)
    const graphRelations = discoverRelatedGraphRelations({
      activePath: activeFile.path,
      activeContent,
      activeTags: activeCache?.tags?.map((tag) => tag.tag) ?? [],
      activeFolderPath: activeFile.parent?.path ?? '',
      resolvedLinks: this.app.metadataCache?.resolvedLinks ?? {},
      candidates: markdownFiles.map((file) => ({
        path: file.path,
        folderPath: file.parent?.path ?? '',
        tags: this.app.metadataCache
          ?.getFileCache?.(file)
          ?.tags?.map((tag) => tag.tag),
      })),
      frontmatterReferences: Object.entries(
        activeCache?.frontmatter ?? {},
      ).flatMap(([field, value]) =>
        extractRelatedFrontmatterReferences(value, field).flatMap(
          (targetRef) => {
            const target = resolveLinkedMarkdownFile({
              app: this.app,
              sourcePath: activeFile.path,
              linkTarget: targetRef,
            })
            return target ? [{ targetPath: target.path, field }] : []
          },
        ),
      ),
      limit,
      signal,
    })
    return await materializeRelatedGraphCandidates(
      graphRelations,
      activeFile.path,
      {
        resolveLinkedFile: (sourcePath, targetRef) => {
          const file = resolveLinkedMarkdownFile({
            app: this.app,
            sourcePath,
            linkTarget: targetRef,
          })
          return file ? { path: file.path } : null
        },
        readFile: async (path) => {
          const file = this.app.vault.getFileByPath(path)
          return file?.extension === 'md'
            ? await this.app.vault.cachedRead(file)
            : null
        },
        titleForPath: (path) =>
          this.app.vault.getFileByPath(path)?.basename ?? path,
        signal,
      },
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    // bring leaf to foreground (uncollapse sidebar if it's collapsed)
    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }

  // Inline writing: generate a continuation at the cursor. Additive and natively
  // undoable (Ctrl+Z), so it inserts directly without a Diff approval.
  private async inlineContinue(editor: Editor, view: MarkdownView) {
    if (!(await this.ensureReady())) return
    const cursor = editor.getCursor()
    const lastLine = editor.lastLine()
    const precedingText = editor.getRange({ line: 0, ch: 0 }, cursor)
    const followingText = editor.getRange(cursor, {
      line: lastLine,
      ch: editor.getLine(lastLine).length,
    })
    if (!precedingText.trim()) {
      new Notice(t('ui.main.noTextBeforeTheCursorToContinue'))
      return
    }

    // Optional steering instruction; cancelling the prompt cancels the command.
    const instruction = await promptInline(this.app, {
      title: t('ui.main.verbexContinueWriting'),
      placeholder: t('ui.main.optionalDirectionLeaveBlankToContinueAs'),
      ctaText: t('ui.main.continueWriting'),
    })

    const notice = new Notice(t('ui.main.verbexContinuing'), 0)
    try {
      const text = await this.generateInlineText({
        mode: 'continue',
        precedingText,
        followingText,
        instruction,
        notePath: view.file?.path ?? null,
      })
      if (text === null) return
      if (!text) {
        new Notice(t('ui.main.noContentWasGenerated'))
        return
      }
      editor.replaceRange(text, cursor)
      editor.setCursor(
        editor.offsetToPos(editor.posToOffset(cursor) + text.length),
      )
    } catch (error) {
      new Notice(
        t('ui.main.verbexContinuationError', {
          p0: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      notice.hide()
    }
  }

  // Inline writing: rewrite the current selection per a user instruction. Shown
  // as a preview confirmation before replacing (the replace is also undoable).
  private async inlineRewrite(editor: Editor, view: MarkdownView) {
    if (!(await this.ensureReady())) return
    // Capture the range up front: opening the modal moves focus off the editor.
    const from = editor.getCursor('from')
    const to = editor.getCursor('to')
    const selection = editor.getRange(from, to)
    if (!selection.trim()) {
      new Notice(t('ui.main.selectTheTextToRewriteFirst'))
      return
    }

    const instruction = await promptInline(this.app, {
      title: t('ui.main.verbexRewrite'),
      placeholder: t('ui.main.howShouldItBeRevisedExampleMore'),
      ctaText: t('ui.main.rewrite'),
    })
    if (instruction === null) return

    const precedingText = editor.getRange({ line: 0, ch: 0 }, from)
    const lastLine = editor.lastLine()
    const followingText = editor.getRange(to, {
      line: lastLine,
      ch: editor.getLine(lastLine).length,
    })

    const notice = new Notice(t('ui.main.verbexRewriting'), 0)
    let rewritten: string
    try {
      const text = await this.generateInlineText({
        mode: 'rewrite',
        precedingText,
        followingText,
        selection,
        instruction,
        notePath: view.file?.path ?? null,
      })
      if (text === null) return
      rewritten = text
    } catch (error) {
      new Notice(
        t('ui.main.verbexRewriteError', {
          p0: error instanceof Error ? error.message : String(error),
        }),
      )
      return
    } finally {
      notice.hide()
    }

    if (!rewritten || rewritten === selection) {
      new Notice(t('ui.main.noChanges'))
      return
    }

    const preview =
      rewritten.length > 1200 ? `${rewritten.slice(0, 1200)}…` : rewritten
    new ConfirmModal(this.app, {
      title: t('ui.main.verbexRewritePreview'),
      message: t('ui.main.replaceTheSelectionWithTheFollowingN', {
        p0: preview,
      }),
      ctaText: t('ui.main.replace'),
      onConfirm: () => {
        if (!this.lifecycle.isActive) return
        editor.replaceRange(rewritten, from, to)
        editor.setCursor(
          editor.offsetToPos(editor.posToOffset(from) + rewritten.length),
        )
      },
    }).open()
  }

  /** Null when unload happened meanwhile (see runForUi). */
  private async generateInlineText(
    input: Parameters<VerbexController['generateInlineCompletion']>[0],
  ): Promise<string | null> {
    const result = await this.lifecycle.runForUi(input.signal, (signal) =>
      this.verbexController.generateInlineCompletion({ ...input, signal }),
    )
    return result?.text ?? null
  }

  async getDbManager(reason = 'unspecified'): Promise<DatabaseManager> {
    this.startupDiagnostics.mark('database:request', {
      reason,
      cacheHit: Boolean(this.dbManager),
      inFlight: Boolean(this.dbManagerInitPromise),
    })
    if (this.dbManager) {
      return this.dbManager
    }

    if (!this.dbManagerInitPromise) {
      this.dbManagerInitPromise = this.startupDiagnostics.measure(
        'database:init',
        async () => {
          try {
            // Published only if the plugin is still active; a database that
            // finishes opening after unload is closed instead of leaked.
            const created = await this.lifecycle.publishIfActive(
              () =>
                DatabaseManager.create(
                  this.app,
                  this.manifest.dir,
                  this.startupDiagnostics,
                  {
                    reportError: (title, message, log) => {
                      const key = JSON.stringify([title, message, log])
                      if (
                        this.lifecycle.isActive &&
                        !this.openErrorModals.has(key)
                      ) {
                        this.openErrorModals.add(key)
                        const modal = new ErrorModal(
                          this.app,
                          title,
                          message,
                          log,
                          { onClosed: () => this.openErrorModals.delete(key) },
                        )
                        modal.open()
                      }
                    },
                  },
                ),
              (late) => late.cleanup(),
            )
            created.setBackgroundScheduler(this.backgroundScheduler)
            this.dbManager = created
            return created
          } catch (error) {
            this.dbManagerInitPromise = null
            if (
              this.lifecycle.isActive &&
              error instanceof PGLiteAbortedException
            ) {
              new InstallerUpdateRequiredModal(this.app).open()
            }
            throw error
          }
        },
        { reason },
      )
    }

    // if initialization is running, wait for it to complete instead of creating a new initialization promise
    return this.dbManagerInitPromise
  }

  async getRAGEngine(reason = 'unspecified'): Promise<RAGEngine> {
    this.startupDiagnostics.mark('rag:request', {
      reason,
      cacheHit: Boolean(this.ragEngine),
      inFlight: Boolean(this.ragEngineInitPromise),
    })
    if (this.ragEngine) {
      return this.ragEngine
    }

    if (!this.ragEngineInitPromise) {
      this.refreshProviderSecrets()
      this.ragEngineInitializing = true
      this.ragEngineInitPromise = this.startupDiagnostics.measure(
        'rag:init',
        async () => {
          try {
            const dbManager = await this.getDbManager(`${reason}:database`)
            this.ragEngine = await this.lifecycle.publishIfActive(
              async () =>
                new RAGEngine(
                  this.app,
                  this.settings,
                  dbManager.getVectorManager(),
                  this.verbexController.lexicalIndex,
                  () => this.showRuntimeMissingNotice(),
                  (event) => {
                    if (event.type === 'start')
                      this.embeddingIndexActivity.start()
                    if (event.type === 'progress' && event.progress)
                      this.embeddingIndexActivity.update(event.progress)
                    if (event.type === 'finish' && event.summary) {
                      const result = event.summary
                      this.embeddingIndexActivity.finish({
                        ...result,
                        finishedAt: Date.now(),
                      })
                      if (
                        shouldNotifyEmbeddingIndex(
                          event.source,
                          this.settings.embeddingIndexState?.phase ===
                            'rebuilding',
                          result.totalFiles,
                          result.ok,
                        )
                      ) {
                        new Notice(
                          t('ui.embeddingActivity.notice', {
                            p0: result.totalFiles,
                          }) +
                            (result.failedFiles || result.failedChunks
                              ? t('ui.embeddingActivity.noticeFailed', {
                                  p1: result.failedFiles + result.failedChunks,
                                })
                              : ''),
                        )
                      }
                    }
                  },
                ),
              (late) => late.cleanup(),
            )
            if (this.pendingVaultIndexUpdate) {
              this.ragEngine.markVaultIndexDirty()
            }
            if (this.ragEngine.isSemanticSearchReady()) {
              this.setReadinessStage('semantic', 'ready')
              for (const listener of this.relatedNotesReadyListeners) {
                listener()
              }
            } else {
              this.setReadinessStage(
                'semantic',
                'unavailable',
                'Embedding model is not configured or ready.',
              )
            }
            return this.ragEngine
          } catch (error) {
            this.ragEngineInitPromise = null
            this.setReadinessStage(
              'semantic',
              'failed',
              error instanceof Error ? error.message : String(error),
            )
            throw error
          } finally {
            this.ragEngineInitializing = false
          }
        },
        { reason },
      )
    }

    return this.ragEngineInitPromise
  }

  /**
   * Return semantic retrieval only when its engine is already available.
   * Chat context uses this probe so a cold PGlite open, model switch, or
   * failed embedding provider never becomes a foreground wait.
   */
  getRAGEngineIfReady(): RAGEngine | null {
    const ragEngine = this.ragEngine
    return ragEngine?.isSemanticSearchReady() ? ragEngine : null
  }

  async getMcpManager(reason = 'unspecified'): Promise<McpManager> {
    this.startupDiagnostics.mark('mcp:request', {
      reason,
      cacheHit: Boolean(this.mcpManager),
    })
    if (this.mcpInitialization) return this.mcpInitialization
    if (this.mcpManager) {
      return this.mcpManager
    }

    this.mcpInitialization = this.startupDiagnostics.measure(
      'mcp:init',
      async () => {
        try {
          this.mcpManager = new McpManager({
            settings: this.settings,
            readSecret: (name) => readMcpSecret(this.app, name),
            prepareCredentials: (parameters) =>
              this.mcpOAuth.prepare(parameters),
            registerSettingsListener: (
              listener: (settings: VerbexSettings) => void,
            ) => this.addSettingsChangeListener(listener),
          })
          const manager = this.mcpManager
          await manager.initialize()
          if (this.mcpManager !== manager)
            throw new Error('MCP initialization cancelled.')
          return manager
        } catch (error) {
          this.mcpManager = null
          throw error
        }
      },
      { reason },
    )
    try {
      return await this.mcpInitialization
    } finally {
      this.mcpInitialization = null
    }
  }

  private registerTimeout(callback: () => void, timeout: number): void {
    // After unload the timer list is already cleared; run cleanup callbacks
    // (notice.hide) now instead of leaking a timer.
    if (!this.lifecycle.isActive) return callback()
    const timeoutId = window.setTimeout(callback, timeout)
    this.timeoutIds.push(timeoutId)
  }

  private registerVaultIndexEventHandlers() {
    this.startupDiagnostics.mark('vault-events:registered')
    const scheduleUpsertIfMarkdown = (file: TAbstractFile) => {
      if (
        this.shouldScheduleEmbeddingIndexUpdate() &&
        this.shouldIndexMarkdownFile(file)
      ) {
        this.scheduleVaultIndexUpdate({
          type: 'upsert',
          path: file.path,
          observedMtime: file.stat.mtime,
        })
      }
    }

    this.registerEvent(
      this.app.vault.on('create', (file) => {
        this.recordVaultEvent('create', file)
        this.verbexController.catalogService.invalidateForPath(file.path)
        invalidateVaultFileMentionIndex(this.app)
        scheduleUpsertIfMarkdown(file)
        if (this.shouldIndexMarkdownFile(file)) {
          this.scheduleLexicalIndex({ type: 'upsert', file })
        }
      }),
    )
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        this.recordVaultEvent('modify', file)
        this.verbexController.catalogService.invalidateForPath(file.path)
        scheduleUpsertIfMarkdown(file)
        if (this.shouldIndexMarkdownFile(file)) {
          this.scheduleLexicalIndex({ type: 'upsert', file })
        }
      }),
    )
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.recordVaultEvent('delete', file)
        this.verbexController.catalogService.invalidateForPath(file.path)
        invalidateVaultFileMentionIndex(this.app)
        if (
          this.shouldScheduleEmbeddingIndexUpdate() &&
          this.shouldIndexMarkdownFile(file)
        ) {
          this.scheduleVaultIndexUpdate({
            type: 'remove',
            path: file.path,
            observedMtime: file.stat.mtime,
          })
        }
        if (this.shouldIndexMarkdownFile(file)) {
          this.scheduleLexicalIndex({ type: 'remove', path: file.path })
        }
      }),
    )
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        this.recordVaultEvent('rename', file)
        this.verbexController.catalogService.invalidateForPath(
          file.path,
          oldPath,
        )
        invalidateVaultFileMentionIndex(this.app)
        const oldPathWasMarkdown =
          oldPath.endsWith('.md') && !this.isVerbexInternalPath(oldPath)
        if (oldPathWasMarkdown) {
          if (this.shouldScheduleEmbeddingIndexUpdate()) {
            this.embeddingIndexQueue.enqueueRename(
              oldPath,
              this.shouldIndexMarkdownFile(file) ? file.path : null,
              this.shouldIndexMarkdownFile(file) ? file.stat.mtime : null,
            )
            this.scheduleVaultIndexUpdateTimer()
          }
          if (this.shouldIndexMarkdownFile(file)) {
            this.scheduleLexicalIndex({ type: 'remove', path: oldPath })
            this.scheduleLexicalIndex({ type: 'upsert', file })
          } else {
            this.scheduleLexicalIndex({ type: 'remove', path: oldPath })
          }
          return
        }
        scheduleUpsertIfMarkdown(file)
        if (this.shouldIndexMarkdownFile(file)) {
          this.scheduleLexicalIndex({ type: 'upsert', file })
        }
      }),
    )
    this.documentIndexing = installDocumentIndexing(
      this,
      this.backgroundScheduler,
      () => {
        this.scheduleLexicalIndexRefresh()
        if (this.shouldScheduleEmbeddingIndexUpdate()) {
          this.embeddingIndexQueue.requestFullReconcile()
          this.scheduleVaultIndexUpdateTimer()
        }
      },
      () => {
        if (this.shouldScheduleEmbeddingIndexUpdate()) {
          this.embeddingIndexQueue.requestFullReconcile()
          this.scheduleVaultIndexUpdateTimer()
        }
      },
    )
  }

  // Coalesce rapid file changes into a short-delay flush so the BM25 index is
  // rebuilt at most once per burst of edits.
  private scheduleLexicalIndex(mutation: LexicalIndexMutation) {
    this.startupDiagnostics.count(`lexical.queue.${mutation.type}`)
    this.lexicalIndexQueue?.enqueue(mutation)
  }

  private scheduleLexicalIndexRefresh() {
    this.startupDiagnostics.count('lexical.queue.full-refresh')
    this.lexicalIndexQueue?.requestFullRefresh()
  }

  private recordVaultEvent(event: string, file: TAbstractFile): void {
    this.startupEventCounts[event] = (this.startupEventCounts[event] ?? 0) + 1
    this.startupDiagnostics.count(`vault.${event}`)
    if (file instanceof TFile && file.extension === 'md') {
      this.startupDiagnostics.count(`vault.${event}.markdown`)
    }
  }

  private async reconcileLexicalIndexAfterStartup() {
    const queue = this.lexicalIndexQueue
    if (!queue) return

    let planKind: 'mutations' | 'full-refresh' | null = null
    try {
      // Drain an event flush that may have started while layout became ready
      // before taking the snapshot used for reconciliation.
      await queue.flushNow({ surfaceErrors: true })
      const computedAtGeneration = queue.generation
      const plan = await this.verbexController.computeLexicalIndexReconcile()
      planKind = plan.kind
      if (plan.kind === 'full-refresh') {
        queue.requestFullRefresh()
      } else {
        queue.enqueueReconcile(plan.mutations, computedAtGeneration)
      }
      await queue.flushNow({ surfaceErrors: true })
      this.searchIndexState = 'ready'
      this.lexicalIndexSyncError = null
      this.setReadinessStage('lexical', 'ready')
    } catch (error) {
      this.lexicalIndexSyncError =
        error instanceof Error ? error : new Error(String(error))
      this.searchIndexState =
        planKind === 'full-refresh' ? 'unavailable' : 'stale'
      this.setReadinessStage(
        'lexical',
        this.searchIndexState,
        this.lexicalIndexSyncError.message,
      )
      console.error('Verbex: failed to reconcile BM25 index at startup', error)
      new Notice(
        this.searchIndexState === 'unavailable'
          ? t('ui.main.verbexBM25IndexIsUnavailableCheckThe')
          : t('ui.main.verbexBM25IndexMayBeOutOf'),
      )
    }
  }

  private shouldScheduleEmbeddingIndexUpdate(): boolean {
    return this.settings.verbex.search.mode !== 'bm25'
  }

  private shouldIndexMarkdownFile(file: TAbstractFile): file is TFile {
    return (
      file instanceof TFile &&
      file.extension === 'md' &&
      !this.isVerbexInternalPath(file.path)
    )
  }

  // Exclude agent configuration and internal data from RAG indexing.
  private isVerbexInternalPath(path: string): boolean {
    const normalized = normalizePath(path)
    return normalized === VERBEX_DIR || normalized.startsWith(`${VERBEX_DIR}/`)
  }

  private scheduleVaultIndexUpdate(
    mutation?:
      | {
          type: 'upsert'
          path: string
          observedMtime: number
        }
      | {
          type: 'remove'
          path: string
          observedMtime: number | null
        },
  ) {
    this.startupDiagnostics.count('embedding.dirty.schedule')
    if (mutation?.type === 'upsert') {
      this.embeddingIndexQueue.enqueueUpsert(
        mutation.path,
        mutation.observedMtime,
      )
    } else if (mutation?.type === 'remove') {
      this.embeddingIndexQueue.enqueueRemove(
        mutation.path,
        mutation.observedMtime,
      )
    } else {
      this.embeddingIndexQueue.requestFullReconcile()
    }
    this.scheduleVaultIndexUpdateTimer()
  }

  private scheduleVaultIndexUpdateTimer() {
    if (!this.shouldScheduleEmbeddingIndexUpdate()) {
      this.cancelPendingVaultIndexUpdate()
      return
    }
    if (!this.lifecycle.isActive) return
    this.pendingVaultIndexUpdate = true
    this.embeddingIndexActivity.setPending(true)
    if (this.embeddingIndexHold) return
    this.ragEngine?.markVaultIndexDirty()

    this.backgroundScheduler.schedule(
      'embedding-index',
      () => this.updateDirtyVaultIndex(),
      10_000,
    )
  }

  private cancelPendingVaultIndexUpdate() {
    this.pendingVaultIndexUpdate = false
    this.embeddingIndexActivity.setPending(false)
    this.embeddingIndexQueue.clear()
    this.backgroundScheduler.cancel('embedding-index')
  }

  private async updateDirtyVaultIndex() {
    if (!this.shouldScheduleEmbeddingIndexUpdate()) {
      this.cancelPendingVaultIndexUpdate()
      return
    }
    if (!this.pendingVaultIndexUpdate || !this.lifecycle.isActive) {
      return
    }

    const work = this.embeddingIndexQueue.drain()
    if (!work) {
      this.pendingVaultIndexUpdate = false
      this.embeddingIndexActivity.setPending(false)
      return
    }

    try {
      const ragEngine = await this.getRAGEngine('dirty-vault-index')
      ragEngine.markVaultIndexDirty()
      const processed = await ragEngine.updateDirtyVaultIndex(
        undefined,
        work.fullReconcile ? undefined : work.mutations,
      )
      if (!processed) {
        this.embeddingIndexQueue.requeue(work)
        this.scheduleVaultIndexUpdateTimer()
        return
      }
      if (
        ragEngine.hasDirtyVaultIndex() ||
        this.embeddingIndexQueue.hasPending()
      ) {
        this.scheduleVaultIndexUpdateTimer()
        return
      }
      this.pendingVaultIndexUpdate = false
      this.embeddingIndexActivity.setPending(false)
      const state = this.settings.embeddingIndexState
      if (state?.phase === 'rebuilding') {
        await this.persistEmbeddingIndexState(
          completeEmbeddingIndexRebuild(state),
        )
        new Notice(
          t('ui.main.embeddingIndexReady', { p0: state.targetModelId }),
        )
        new EmbeddingDbManageModal(this.app, this).open()
      }
    } catch (error) {
      this.embeddingIndexQueue.requeue(work)
      this.pendingVaultIndexUpdate = true
      const state = this.settings.embeddingIndexState
      if (state?.phase === 'rebuilding') {
        try {
          await this.persistEmbeddingIndexState(
            failEmbeddingIndexRebuild(
              state,
              error instanceof Error ? error.message : String(error),
            ),
          )
        } catch (persistError) {
          console.error(
            'Failed to persist embedding index failure state',
            persistError,
          )
        }
      }
      console.error('Failed to update vault index from file change:', error)
      const kind = classifyEmbeddingError(error)
      if (shouldHoldEmbeddingIndex(kind)) {
        this.embeddingIndexHold = kind
        this.embeddingIndexActivity.setHold(kind)
        if (kind === 'runtime_missing') this.showRuntimeMissingNotice()
        return
      }
      this.scheduleVaultIndexUpdateTimer()
      new Notice(t('ui.main.verbexCouldNotUpdateTheVaultIndex'))
    }
  }

  isLocalEmbeddingRuntimeInstalled(): boolean {
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getBasePath?: () => string
    }
    if (!adapter.getBasePath || !this.manifest.dir) return false
    const process = nodeProcess()
    return isLocalE5RuntimeInstalled(
      join(adapter.getBasePath(), this.manifest.dir),
      existsSync,
      process.platform,
      process.arch,
    )
  }

  private releaseEmbeddingIndexHold() {
    this.embeddingIndexHold = null
    this.embeddingIndexActivity.setHold()
    if (this.pendingVaultIndexUpdate || this.embeddingIndexQueue.hasPending())
      this.scheduleVaultIndexUpdateTimer()
  }

  private showRuntimeMissingNotice() {
    if (this.runtimeMissingNotified) return
    this.runtimeMissingNotified = true
    const fragment = createFragment((el) => {
      el.createEl('p', { text: t('ui.main.embeddingRuntimeMissing') })
      const download = el.createEl('button', {
        text: t('ui.main.embeddingGetOfflinePack'),
      })
      download.onclick = () =>
        window.open('https://github.com/EverydayMind/obsidian-verbex/releases')
      const switchButton = el.createEl('button', {
        text: t('ui.main.embeddingSwitchToKeyword'),
      })
      switchButton.onclick = () => {
        void this.setSettings({
          ...this.settings,
          verbex: {
            ...this.settings.verbex,
            search: { ...this.settings.verbex.search, mode: 'bm25' },
          },
        }).then(() => notice.hide())
      }
    })
    const notice = new Notice(fragment, 0)
  }

  private shouldScheduleVaultIndexUpdateForSettings(
    oldSettings: VerbexSettings,
    newSettings: VerbexSettings,
  ) {
    return (
      oldSettings.verbex.search.mode !== newSettings.verbex.search.mode ||
      oldSettings.ragOptions.chunkSize !== newSettings.ragOptions.chunkSize ||
      oldSettings.ragOptions.excludePatterns.join('\n') !==
        newSettings.ragOptions.excludePatterns.join('\n') ||
      oldSettings.ragOptions.includePatterns.join('\n') !==
        newSettings.ragOptions.includePatterns.join('\n')
    )
  }

  private shouldScheduleLexicalIndexUpdateForSettings(
    oldSettings: VerbexSettings,
    newSettings: VerbexSettings,
  ) {
    return (
      JSON.stringify(oldSettings.verbex.search.documents) !==
        JSON.stringify(newSettings.verbex.search.documents) ||
      oldSettings.verbex.search.excludePaths.join('\n') !==
        newSettings.verbex.search.excludePaths.join('\n') ||
      oldSettings.ragOptions.excludePatterns.join('\n') !==
        newSettings.ragOptions.excludePatterns.join('\n') ||
      oldSettings.ragOptions.includePatterns.join('\n') !==
        newSettings.ragOptions.includePatterns.join('\n')
    )
  }

  private async migrateToJsonStorage() {
    await migrateToJsonDatabase(
      this.app,
      () => this.getDbManager('migration'),
      this.jsonStorage,
      async () => {
        try {
          await this.reloadChatView()
          console.debug('Migration to JSON storage completed successfully')
        } catch (error) {
          throw new PostMigrationUiError(
            error instanceof Error ? error.message : String(error),
            error,
          )
        }
      },
    )
  }

  private async reloadChatView() {
    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      return
    }
    new Notice(t('ui.main.reloadingForMigration'), 1000)
    leaves[0].detach()
    await this.activateChatView()
  }
}
