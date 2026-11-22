import { App } from 'obsidian'

import { SemanticSearchProvider } from '../../context/ContextBuilder'
import { ContextForestService } from '../../context/ContextForestService'
import type { LexicalIndexRepository } from '../../context/LexicalIndex'
import type { ProviderExecutionContext } from '../../provider/ProviderRegistry'
import type { ProviderRuntime } from '../../provider/ToolProviderHub'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { resolveLoadedSettings } from '../../settings/schema/settings'
import type { ChangeOutcome } from '../../workflow/StepExecutor'
import type { AgentToolOutcome } from '../llm/toolOutcome'
import {
  type ReportStylePorts,
  ReportStyleService,
} from '../report-style/service'
import { TidyLedger, executeTidyTool, isTidyTool } from '../tidy/tidyLocalTools'
import { appendFileMentions } from '../vault-facts/fileMentions'
import { executeVaultFactTool } from '../vault-facts/vaultFactLocalTools'
import { isVaultFactTool } from '../vault-facts/vaultFactTools'

import { aiPrivateErrorResult, guardAiPrivateArgs } from './aiPrivateLocalRead'
import { executeSearchContextTreeTool } from './contextForestTool'
import { executeRestore } from './executeRestore'
import { executeFileTool } from './fileLocalTools'
import { executeIndexTool } from './indexLocalTools'
import { createLocalCensus } from './localCensus'
import { NOTE_LOCAL_NAMES, SEARCH_LOCAL_NAMES } from './localDispatchNames'
import { createLocalQuerySessions } from './localQuerySessions'
import {
  DEFAULT_TOOL_REQUEST_LOG,
  FILE_LOCAL_TOOL_NAMES,
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  assertLocalToolPaths,
  extractLinks,
  formatToolRequestEntry,
} from './localToolCommon'
import { executeNoteTool } from './noteLocalTools'
import { assertQueryWorkflow, queryExports } from './queryExportDispatch'
import { getReportStyleToolDefinitions } from './reportStyleTools'
import { executeSearchTool } from './searchLocalTools'
import { readerProviders } from './sourceReadHint'

export { DEFAULT_TOOL_REQUEST_LOG, extractLinks, formatToolRequestEntry }
export type { ToolResult, ToolArgs, ToolExecutionContext }

export class LocalToolRegistry {
  restoreLastChange?: (
    runId: string,
    signal?: AbortSignal,
  ) => Promise<AgentToolOutcome>
  private readonly reportStyles: ReportStyleService
  private readonly contextForestService: ContextForestService
  /** Memory-only: a plugin restart expires every exhaustive query cursor. */
  private readonly querySessions = createLocalQuerySessions()
  private readonly tidyLedger = new TidyLedger()
  readonly census = createLocalCensus(
    this.querySessions.obsidianQueryLinesSessions,
    () => this.app,
    () => this.getSettings?.(),
  )

  constructor(
    private app: App,
    private getContextBudget: () => number = () => 32000,
    private getSemanticProvider?: () => Promise<SemanticSearchProvider | null>,
    private getToolRequestLogPath: () => string = () =>
      DEFAULT_TOOL_REQUEST_LOG,
    private getPriorityFolder: () => string = () => '',
    private providerRegistry?: ProviderRuntime,
    private lexicalIndex?: LexicalIndexRepository | null,
    private getSettings?: () => VerbexSettings,
    private semanticCallbacks?: import('./localToolCommon').SemanticCallbacks,
  ) {
    this.reportStyles = new ReportStyleService(this.app)
    this.contextForestService = new ContextForestService({
      app: this.app,
      getSettings: this.getSettings ?? (() => resolveLoadedSettings({})),
      lexicalIndex: this.lexicalIndex ?? null,
      getSemanticProvider: this.getSemanticProvider,
    })
  }

  setReportStylePorts(ports: ReportStylePorts): void {
    this.reportStyles.setPorts(ports)
  }
  finalizeReportStyleOutcome(
    outcome: ChangeOutcome,
    base: AgentToolOutcome,
    runId?: string,
  ): Promise<AgentToolOutcome> {
    if (runId) this.tidyLedger.record(runId, outcome)
    return this.reportStyles.finalizeOutcome(outcome, base)
  }

  async execute(
    tool: string,
    args: ToolArgs,
    providerContext?: ProviderExecutionContext,
    workflow = false,
  ): Promise<ToolResult> {
    if (this.providerRegistry?.hasTool(tool))
      return this.providerRegistry.executeTool(tool, args, providerContext)
    try {
      assertQueryWorkflow(tool, workflow)
      if (tool === 'restore_last_change')
        return await executeRestore(
          this.restoreLastChange,
          providerContext?.runId,
          providerContext?.signal,
        )
      assertLocalToolPaths(this.app, tool, args, this.getSettings?.())
    } catch (error) {
      return { kind: 'error', message: (error as Error).message }
    }
    const ctx: ToolExecutionContext = {
      ...{ app: this.app, configFolders: this.getSettings?.() },
      ...this.semanticCallbacks,
      getContextBudget: this.getContextBudget,
      getSemanticProvider: this.getSemanticProvider,
      getToolRequestLogPath: this.getToolRequestLogPath,
      getPriorityFolder: this.getPriorityFolder,
      exposedToolNames: providerContext?.snapshot?.toolNames,
      readerProviders: readerProviders(
        this.providerRegistry?.native?.getStatuses(),
      ),
      pendingApprovals: this.providerRegistry?.pendingPluginApprovals,
      signal: providerContext?.signal,
      conversationId: providerContext?.runId,
      ...this.querySessions,
    }
    const refused = guardAiPrivateArgs(args, ctx)
    if (refused) return refused

    try {
      if (
        getReportStyleToolDefinitions().some(
          (item) => item.function.name === tool,
        )
      )
        return await this.reportStyles.execute(
          tool,
          args,
          providerContext?.signal,
        )
      if (Object.hasOwn(queryExports, tool))
        return await queryExports[tool](args, ctx)
      if (isTidyTool(tool))
        return await executeTidyTool(tool, args, ctx, this.tidyLedger)
      if (isVaultFactTool(tool))
        return await executeVaultFactTool(tool, args, ctx)
      if (tool === 'search_context_tree') {
        return await executeSearchContextTreeTool(args, {
          app: this.app,
          getContextBudget: this.getContextBudget,
          getSemanticProvider: this.getSemanticProvider,
          lexicalIndex: this.lexicalIndex,
          getSettings: this.getSettings,
          contextForestService: this.contextForestService,
        })
      }

      // 1. File & Folder Operations
      if (FILE_LOCAL_TOOL_NAMES.includes(tool))
        return await appendFileMentions(
          tool,
          args,
          ctx,
          await executeFileTool(tool, args, ctx),
        )

      // 2. Search & Graph Operations
      if (SEARCH_LOCAL_NAMES.includes(tool))
        return await executeSearchTool(tool, args, ctx)

      // 3. Note inspection, extraction, taxonomy, and capability requests
      if (NOTE_LOCAL_NAMES.includes(tool)) {
        return await executeNoteTool(tool, args, ctx)
      }

      // 4. Review Index & Checklist Operations
      if (
        ['checklist_next', 'verify_wiki_links', 'audit_index'].includes(tool)
      ) {
        return await executeIndexTool(tool, args, ctx)
      }

      return { kind: 'error', message: `Unknown tool: ${tool}` }
    } catch (error) {
      const refusal = aiPrivateErrorResult(error)
      if (refusal) return refusal
      return {
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
