import { App, normalizePath } from 'obsidian'

import { RunArtifactStore } from '../../runstate/RunArtifactStore'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { ChatWorkflowContextItem } from '../../types/chat'
import { ToolCallRequest } from '../../types/tool-call.types'
import { sha256Hex } from '../../utils/hash'
import { ProposedChange, VerbexRunState } from '../../verbex/types'
import { ChangeOutcome, StepExecutor } from '../../workflow/StepExecutor'
import { BatchContract } from '../batch/contracts'
import {
  BatchSliceLedgerEntry,
  PersistedBatchLedger,
  parseBatchLedger,
  recoverExpiredBatchLeases,
  renderBatchLedger,
  synchronizeBatchCoverageLedger,
} from '../batch/foregroundBatchRunner'
import { AgentLoopResult, AgentToolExecutionResult } from '../llm/agentLoop'
import { toolFailed, toolRejected, toolSucceeded } from '../llm/toolOutcome'
import { makeCoverageUnitId } from '../routing/coverage'
import { LocalToolRegistry } from '../tools/localTools'
import { parseToolArgs } from '../tools/parseToolArgs'
import { discoverIndexFolder } from '../tools/reviewIndexDiscovery'
import {
  frontmatterValue,
  getIndexProvenance,
} from '../tools/reviewIndexMetadata'
import {
  ChecklistItem,
  FindingValidationError,
  checklistPhaseProgress,
  duplicateChecklistIds,
  formatDuplicateChecklistIds,
  parseChecklist,
  parseChecklistLogs,
  resolveChecklistItem,
  resolveTreatyPath,
} from '../tools/treatyWiki'

import {
  summarizeBatchOutcomes,
  verifyUniquePaths,
} from './batchOutcomeSummary'
import * as text from './reviewCoordinatorText'
import { ReviewIndexBatchRunner } from './ReviewIndexBatchRunner'
import { ReviewIndexRuntime } from './ReviewIndexRuntime'
import {
  TreatyBatchContextPacketBuilder,
  stripMarkdownFrontmatter,
} from './TreatyBatchContextPacketBuilder'

export type WikiTargetMode = 'build' | 'rebuild' | 'reuse'
export type WikiTargetDecision = { wikiFolder: string; mode: WikiTargetMode }
export type WikiTargetConfirmation = {
  proposedFolder: string
  sourceLabel: string
  probeFolder: (folder: string) => { noteCount: number; hasChecklist: boolean }
  labels?: import('../../verbex/types').IndexTargetLabels
}
export type WikiTargetConfirm = (
  info: WikiTargetConfirmation,
) => Promise<WikiTargetDecision | null>

export type TreatyChecklist = {
  path: string
  markdown: string
  items: ChecklistItem[]
  docId: string
  buildId: string
}

export type ReviewIndexCoordinatorDeps = {
  app: App
  getSettings: () => VerbexSettings
  runtime: ReviewIndexRuntime
  localTools: LocalToolRegistry
  stepExecutor: StepExecutor
  loadRunForUpdate: (runId: string, title: string) => Promise<VerbexRunState>
  updateRunArtifacts: (
    runId: string,
    mutate: (run: VerbexRunState) => VerbexRunState,
    title?: string,
  ) => Promise<void>
  recordToolOutcome: (
    runId: string,
    outcome: ChangeOutcome,
    options?: { openAppliedNotes?: boolean },
  ) => Promise<void>
}

const TREATY_BATCH_LEDGER_FILE = '_batch_ledger.md'
const TREATY_BATCH_LEASE_TIMEOUT_MS = 5 * 60 * 1000

export class ReviewIndexCoordinator {
  private readonly wikiTargetDecisions = new Map<string, WikiTargetDecision>()
  private readonly packetBuilder: TreatyBatchContextPacketBuilder
  private readonly batchRunner: ReviewIndexBatchRunner
  constructor(private deps: ReviewIndexCoordinatorDeps) {
    this.packetBuilder = new TreatyBatchContextPacketBuilder(deps.app)
    this.batchRunner = new ReviewIndexBatchRunner({
      app: deps.app,
      getSettings: deps.getSettings,
      packetBuilder: this.packetBuilder,
      treatyPath: this.treatyPath.bind(this) as typeof this.treatyPath,
      treatyBatchLedgerPath: this.treatyBatchLedgerPath.bind(
        this,
      ) as typeof this.treatyBatchLedgerPath,
      persistTreatyBatchLedger: this.persistTreatyBatchLedger.bind(
        this,
      ) as typeof this.persistTreatyBatchLedger,
      loadTreatyChecklist: this.loadTreatyChecklist.bind(
        this,
      ) as typeof this.loadTreatyChecklist,
      loadTreatyBatchLedger: this.loadTreatyBatchLedger.bind(
        this,
      ) as typeof this.loadTreatyBatchLedger,
      proposedWrite: this.proposedWrite.bind(this) as typeof this.proposedWrite,
      applyTreatyBatch: this.applyTreatyBatch.bind(
        this,
      ) as typeof this.applyTreatyBatch,
    })
  }

  private terminalToolFailure(
    text: string,
    partialMutation = false,
  ): AgentToolExecutionResult {
    return toolFailed(text, {
      mutation: partialMutation ? 'partial' : 'none',
    })
  }

  private treatyPath(folder: string, relative: string): string | null {
    return resolveTreatyPath(folder, relative)
  }

  private async proposedWrite(
    path: string,
    content: string,
    tool: string,
  ): Promise<ProposedChange> {
    const result = await this.deps.localTools.execute('write_file', {
      path,
      content,
    })
    if (result.kind !== 'change') {
      throw new Error(
        result.kind === 'error' ? result.message : text.proposalFailed(path),
      )
    }
    result.change.tool = tool
    return result.change
  }

  private async applyTreatyBatch(
    runId: string,
    changes: ProposedChange[],
    autoApply = false,
    openAppliedNotes = true,
  ): Promise<ChangeOutcome[]> {
    verifyUniquePaths(changes)

    // `auto_apply: true` is batch-scoped silent approval, not session Auto Mode.
    // This avoids opening a Diff/countdown for every finding while preserving
    // permission checks, checkpoints, conflict detection, and explicit review
    // for dangerous changes.
    const outcomes = await this.deps.stepExecutor.processBatch(runId, changes, {
      silentSafeApproval: autoApply,
    })
    for (const outcome of outcomes) {
      await this.deps.recordToolOutcome(runId, outcome, { openAppliedNotes })
    }
    return outcomes
  }

  /**
   * Wiki 대상 결정 캐시 키. 같은 run에서 다른 협정문을 검토하기 시작하면
   * (원본 경로가 바뀌면) 사용자에게 다시 묻도록 원본 경로를 키에 포함한다.
   */
  private wikiDecisionKey(
    runId: string,
    args: Record<string, unknown>,
  ): string {
    const source =
      typeof args.source_path === 'string' && args.source_path.trim()
        ? normalizePath(args.source_path.trim())
        : typeof args.source_folder === 'string'
          ? normalizePath(args.source_folder.trim()).replace(/\/$/, '')
          : ''
    return `${runId}::${source}`
  }

  probeWikiFolder(folder: string): {
    noteCount: number
    hasChecklist: boolean
  } {
    const normalized = normalizePath(folder.trim()).replace(/\/$/, '')
    if (!normalized) return { noteCount: 0, hasChecklist: false }
    const notes = this.deps.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${normalized}/`))
    return {
      noteCount: notes.length,
      hasChecklist: notes.some(
        (file) => file.path === `${normalized}/_checklist.md`,
      ),
    }
  }

  private decidedWikiFoldersForRun(runId: string): string[] {
    const prefix = `${runId}::`
    return [
      ...new Set(
        [...this.wikiTargetDecisions.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, decision]) => decision.wikiFolder)
          .filter(Boolean),
      ),
    ]
  }

  decidedWikiFolderWithChecklist(runId: string): string | null {
    const candidates = this.decidedWikiFoldersForRun(runId).filter(
      (folder) => this.probeWikiFolder(folder).hasChecklist,
    )
    return candidates.length === 1 ? candidates[0] : null
  }

  async verifyChecklistPhase(
    indexFolder: string,
    phase: string,
  ): Promise<
    | { complete: true; warnings?: string[] }
    | { complete: false; remaining: string[] }
  > {
    const folder = normalizePath(indexFolder).replace(/\/$/, '')
    const checklistPath = normalizePath(`${folder}/_checklist.md`)
    if (!(await this.deps.app.vault.adapter.exists(checklistPath))) {
      return {
        complete: false,
        remaining: [text.missingChecklist(checklistPath)],
      }
    }

    const checklistMarkdown =
      await this.deps.app.vault.adapter.read(checklistPath)
    const items = parseChecklist(checklistMarkdown)
    const duplicates = duplicateChecklistIds(items)
    if (duplicates.length > 0) {
      return {
        complete: false,
        remaining: [text.duplicateIds(formatDuplicateChecklistIds(duplicates))],
      }
    }
    const logWarnings = [...parseChecklistLogs(checklistMarkdown)]
      .filter(
        ([itemId, log]) =>
          itemId.startsWith(`${phase}:`) &&
          (log.status === 'needs_attention' ||
            log.note?.startsWith('needs_attention')),
      )
      .map(([itemId, log]) => {
        const note = log.note?.replace(/^needs_attention\s*:?\s*/, '')
        return `${itemId}: ${note?.length ? note : text.reviewCoordinatorText().quarantined}`
      })
    if (phase === 'R') {
      const ledgerPath = this.treatyBatchLedgerPath(folder)
      const ledger = (await this.deps.app.vault.adapter.exists(ledgerPath))
        ? parseBatchLedger(await this.deps.app.vault.adapter.read(ledgerPath))
        : null
      const checklistBuildId = frontmatterValue(checklistMarkdown, 'build_id')
      if (ledger && ledger.buildId === checklistBuildId) {
        const nonTerminal = ledger.entries.filter(
          (entry) => entry.status === 'pending' || entry.status === 'running',
        )
        if (nonTerminal.length > 0) {
          return {
            complete: false,
            remaining: nonTerminal.map((entry) => entry.id),
          }
        }
        const factErrors = ledger.entries.filter(
          (entry) =>
            entry.status === 'stale_input' ||
            entry.status === 'apply_error' ||
            entry.status === 'protocol_error',
        )
        if (factErrors.length > 0) {
          return {
            complete: false,
            remaining: factErrors.map(
              (entry) =>
                `${entry.id}: ${entry.status}${entry.note ? ` — ${entry.note}` : ''}`,
            ),
          }
        }
        if (ledger.entries.length > 0) {
          const done = ledger.entries.filter(
            (entry) =>
              entry.status === 'done' ||
              entry.status === 'input_empty' ||
              entry.status === 'output_empty' ||
              entry.status === 'truncated',
          )
          const attention = ledger.entries.filter(
            (entry) => entry.status === 'needs_attention',
          )
          if (done.length === 0 && attention.length > 0) {
            return {
              complete: false,
              remaining: [
                text.allQuarantined(attention.length, ledger.entries.length),
              ],
            }
          }
          return attention.length > 0
            ? {
                complete: true,
                warnings: [
                  text.phaseAttention(attention.length, ledger.entries.length),
                  ...logWarnings,
                ],
              }
            : logWarnings.length > 0
              ? { complete: true, warnings: logWarnings }
              : { complete: true }
        }
      }
    }

    const progress = checklistPhaseProgress(items, phase)
    if (progress.complete)
      return logWarnings.length > 0
        ? { complete: true, warnings: logWarnings }
        : { complete: true }
    const remaining = items
      .filter(
        (item) => item.id.startsWith(`${phase}:`) && item.state === 'pending',
      )
      .map((item) => item.id)
    return {
      complete: false,
      remaining: remaining.length > 0 ? remaining : [text.missingPhase(phase)],
    }
  }

  getWikiDecision(
    runId: string,
    args: Record<string, unknown>,
  ): WikiTargetDecision | undefined {
    return this.wikiTargetDecisions.get(this.wikiDecisionKey(runId, args))
  }

  async recoverWikiFolderArtifact(run: VerbexRunState): Promise<string | null> {
    const folder = this.decidedWikiFolderWithChecklist(run.id)
    if (!folder) return null
    const checklist = this.deps.app.vault.getFileByPath(
      `${folder}/_checklist.md`,
    )
    if (!checklist) return null
    const markdown = await this.deps.app.vault.cachedRead(checklist)
    if (
      !getIndexProvenance(markdown) ||
      !frontmatterValue(markdown, 'build_id') ||
      parseChecklist(markdown).length === 0
    ) {
      return null
    }
    await this.deps.updateRunArtifacts(run.id, (latest) =>
      RunArtifactStore.setIndexFolder(latest, folder),
    )
    return folder
  }

  /**
   * Confirm the wiki destination with the user before building or reusing.
   * Without a confirm callback (headless/tests) the tool arguments are used
   * as-is, preserving the previous behavior.
   */
  private async resolveWikiTarget(
    decisionKey: string,
    proposedFolder: string,
    sourceLabel: string,
    rebuildRequested: boolean,
    confirm?: WikiTargetConfirm,
  ): Promise<WikiTargetDecision | 'cancelled'> {
    const cached = this.wikiTargetDecisions.get(decisionKey)
    if (cached) return cached
    if (!confirm)
      return {
        wikiFolder: proposedFolder,
        mode: rebuildRequested ? 'rebuild' : 'build',
      }
    const decision = await confirm({
      proposedFolder,
      sourceLabel,
      probeFolder: (folder) => this.probeWikiFolder(folder),
    })
    if (!decision) return 'cancelled'
    const normalized: WikiTargetDecision = {
      wikiFolder: normalizePath(decision.wikiFolder.trim()).replace(/\/$/, ''),
      mode: decision.mode,
    }
    this.wikiTargetDecisions.set(decisionKey, normalized)
    return normalized
  }

  /** 사용자가 "기존 wiki 재사용"을 택했을 때 빌드 대신 반환하는 재개 안내. */
  private async persistWikiFolderArtifact(
    runId: string,
    wikiFolder: string,
  ): Promise<void> {
    await this.deps.updateRunArtifacts(
      runId,
      (base) => RunArtifactStore.setIndexFolder(base, wikiFolder),
      `Treaty Wiki: ${wikiFolder}`,
    )
  }

  private async describeExistingWiki(
    runId: string,
    wikiFolder: string,
  ): Promise<AgentToolExecutionResult> {
    const checklistPath = `${wikiFolder}/_checklist.md`
    const file = this.deps.app.vault.getFileByPath(checklistPath)
    if (!file)
      return this.terminalToolFailure(
        text.reuseFailure(checklistPath, 'missing'),
      )
    const markdown = await this.deps.app.vault.cachedRead(file)
    const items = parseChecklist(markdown)
    if (items.length === 0)
      return this.terminalToolFailure(text.reuseFailure(checklistPath, 'empty'))
    if (
      !getIndexProvenance(markdown) ||
      !frontmatterValue(markdown, 'build_id')
    ) {
      return this.terminalToolFailure(
        text.reuseFailure(checklistPath, 'provenance'),
      )
    }
    await this.persistWikiFolderArtifact(runId, wikiFolder)
    const progress = (['R', 'C', 'F'] as const)
      .map((phase) => {
        const p = checklistPhaseProgress(items, phase)
        return `Phase ${phase} ${p.processed}/${p.total}`
      })
      .join(' | ')
    return toolSucceeded(
      [
        text.reuseHeader(wikiFolder, progress),
        text.reviewCoordinatorText().reuse,
        text.resumeChecklist(wikiFolder),
      ].join('\n'),
      {
        terminal: true,
        artifacts: { index_folder: wikiFolder },
      },
    )
  }

  async executeRegisteredTool(input: {
    runId: string
    call: ToolCallRequest
    workflow?: ChatWorkflowContextItem
    activeStepId?: string
    activeSkills?: { batch?: BatchContract }[]
    confirmWikiTarget?: WikiTargetConfirm
    autoApply?: boolean
    /** Controls automatic UI opening only; backend reads remain unchanged. */
    openAppliedNotes?: boolean
  }): Promise<AgentToolExecutionResult> {
    const {
      runId,
      workflow,
      activeStepId,
      confirmWikiTarget,
      autoApply = false,
      openAppliedNotes = true,
    } = input
    let { call } = input

    if (call.name === 'build_review_index') {
      const buildStep = workflow?.steps?.find(
        (step) => step.id === activeStepId,
      )
      const reviewStep = workflow?.steps?.find(
        (step) => step.batch?.state_authority === 'checklist',
      )
      const reviewBatch =
        reviewStep?.batch ??
        input.activeSkills?.find(
          (skill) => skill.batch?.state_authority === 'checklist',
        )?.batch
      const args = parseToolArgs(call.arguments)
      if (reviewBatch) {
        args.structure_profile ??= reviewBatch.segmenter.profile
        const profile = workflow?.profiles?.[reviewBatch.segmenter.profile]
        if (profile?.boundaries) args.structure_boundaries = profile.boundaries
        args.finding_schema ??= reviewBatch.output.schema
        const declared = reviewBatch.output.schema
          ? workflow?.schemas?.[reviewBatch.output.schema]
          : undefined
        if (declared?.columns) {
          args.finding_schema_columns = declared.columns.map((column) =>
            typeof column === 'string'
              ? { name: column }
              : { name: column.name, enum: column.enum },
          )
        }
      }
      // WorkflowLoader only type-casts `checklist` (no deep validation of
      // `phases`), so a malformed YAML value can reach here as a non-array -
      // guard with Array.isArray rather than trusting the declared type.
      const declaredPhases = Array.isArray(workflow?.checklist?.phases)
        ? workflow.checklist.phases.filter(
            (phase): phase is { id: string; title?: string } =>
              Boolean(phase) && typeof phase.id === 'string',
          )
        : undefined
      const phases = declaredPhases?.length
        ? declaredPhases.map((phase) => phase.id)
        : workflow
          ? [
              ...new Set(
                workflow.steps
                  ?.map((step) => step.verification?.requireChecklistComplete)
                  .filter((phase): phase is string => Boolean(phase)) ?? [],
              ),
            ]
          : ['R', 'C']
      if (!phases.includes('R')) phases.unshift('R')
      if (!phases.includes('F')) phases.push('F')
      args.checklist_phases ??= phases
      call = { ...call, arguments: JSON.stringify(args) }
      // Internal-only: workflow.checklist.phases carries titles, so it isn't
      // put on args.checklist_phases (the LLM-facing tool arg, id-only schema
      // in indexTools.ts). When absent, normalize the derived id list above
      // into the same { id, title? } shape so Runtime has one input shape.
      const checklistPhaseDefinitions = declaredPhases?.length
        ? declaredPhases
        : phases.map((id) => ({ id }))
      const labeledConfirm = confirmWikiTarget
        ? (info: WikiTargetConfirmation) =>
            confirmWikiTarget({ ...info, labels: buildStep?.targetLabels })
        : undefined
      const result = await this.executeBuildReviewIndex(
        runId,
        call,
        labeledConfirm,
        autoApply,
        checklistPhaseDefinitions,
        openAppliedNotes,
      )
      const folder = result.artifacts?.index_folder
      const outputArtifact = buildStep?.outputArtifact
      if (folder && outputArtifact) {
        await this.deps.updateRunArtifacts(
          runId,
          (run) => RunArtifactStore.setArtifact(run, outputArtifact, folder),
          `${outputArtifact} artifact`,
        )
        result.artifacts = {
          ...result.artifacts,
          [outputArtifact]: folder,
        }
      }
      return result
    }
    if (call.name === 'checklist_next') {
      return this.executeChecklistNext(runId, call)
    }
    if (call.name === 'submit_finding') {
      return this.executeSubmitFinding(runId, call, autoApply, openAppliedNotes)
    }
    if (call.name === 'compile_report') {
      return this.executeCompileReport(runId, call, autoApply, openAppliedNotes)
    }
    if (call.name === 'audit_index') {
      return this.executeVerifyLinks(runId, call, autoApply, openAppliedNotes)
    }
    return this.terminalToolFailure(text.unsupportedReviewTool(call.name))
  }

  async executeBuildReviewIndex(
    runId: string,
    call: ToolCallRequest,
    confirmWikiTarget?: WikiTargetConfirm,
    autoApply = false,
    checklistPhaseDefinitions?: { id: string; title?: string }[],
    openAppliedNotes = true,
  ): Promise<AgentToolExecutionResult> {
    try {
      const args = parseToolArgs(call.arguments)
      const sourcePath =
        typeof args.source_path === 'string'
          ? normalizePath(args.source_path.trim())
          : ''
      const sourceFolder =
        typeof args.source_folder === 'string'
          ? normalizePath(args.source_folder.trim()).replace(/\/$/, '')
          : ''
      const folderVal = args.index_folder ?? args.wiki_folder
      const proposedWikiFolder =
        typeof folderVal === 'string'
          ? normalizePath(folderVal.trim()).replace(/\/$/, '')
          : ''
      if ((!sourcePath && !sourceFolder) || (sourcePath && sourceFolder))
        return this.terminalToolFailure(
          text.reviewCoordinatorText().sourceRequired,
        )
      const decision = await this.resolveWikiTarget(
        this.wikiDecisionKey(runId, args),
        proposedWikiFolder,
        sourcePath || sourceFolder,
        args.rebuild === true,
        confirmWikiTarget,
      )
      if (decision === 'cancelled')
        return toolRejected(text.reviewCoordinatorText().cancelled)
      const wikiFolder = decision.wikiFolder
      if (!wikiFolder)
        return this.terminalToolFailure(
          text.reviewCoordinatorText().folderRequired,
        )
      if (decision.mode === 'reuse')
        return this.describeExistingWiki(runId, wikiFolder)
      const rebuild = decision.mode === 'rebuild' || args.rebuild === true

      if (args.preview === true) {
        const previewResult = await this.deps.runtime.buildReviewIndex({
          sourcePath,
          sourceFolder,
          wikiFolder,
          rebuild,
          preview: true,
          maxUnitTokens:
            typeof args.max_unit_tokens === 'number'
              ? args.max_unit_tokens
              : undefined,
          structureProfile:
            typeof args.structure_profile === 'string'
              ? args.structure_profile
              : undefined,
          structureBoundaries: Array.isArray(args.structure_boundaries)
            ? args.structure_boundaries
            : undefined,
          findingSchema:
            typeof args.finding_schema === 'string'
              ? args.finding_schema
              : undefined,
          findingSchemaColumns: Array.isArray(args.finding_schema_columns)
            ? args.finding_schema_columns
            : undefined,
          checklistPhases: Array.isArray(args.checklist_phases)
            ? args.checklist_phases.map(String)
            : undefined,
          checklistPhaseDefinitions,
        })
        return toolSucceeded(previewResult.previewResult ?? '')
      }

      const buildResult = await this.deps.runtime.buildReviewIndex({
        sourcePath,
        sourceFolder,
        wikiFolder,
        rebuild,
        preview: false,
        maxUnitTokens:
          typeof args.max_unit_tokens === 'number'
            ? args.max_unit_tokens
            : undefined,
        structureProfile:
          typeof args.structure_profile === 'string'
            ? args.structure_profile
            : undefined,
        structureBoundaries: Array.isArray(args.structure_boundaries)
          ? args.structure_boundaries
          : undefined,
        findingSchema:
          typeof args.finding_schema === 'string'
            ? args.finding_schema
            : undefined,
        findingSchemaColumns: Array.isArray(args.finding_schema_columns)
          ? args.finding_schema_columns
          : undefined,
        checklistPhases: Array.isArray(args.checklist_phases)
          ? args.checklist_phases.map(String)
          : undefined,
        checklistPhaseDefinitions,
      })

      const outcomes = await this.applyTreatyBatch(
        runId,
        buildResult.changes ?? [],
        autoApply,
        openAppliedNotes,
      )
      const applied = outcomes.filter(
        (outcome) => outcome.status === 'applied',
      ).length
      if (applied !== outcomes.length) {
        const { detail } = summarizeBatchOutcomes(outcomes)
        return this.terminalToolFailure(
          [
            text.buildPartial(applied, outcomes.length),
            detail,
            text.reviewCoordinatorText().rebuild,
          ].join('\n'),
          applied > 0,
        )
      }
      await this.persistWikiFolderArtifact(runId, wikiFolder)
      return toolSucceeded(
        text.buildApplied(
          wikiFolder,
          typeof args.structure_profile === 'string'
            ? args.structure_profile
            : 'legal-numbered',
          buildResult.unitsCount ?? 0,
          buildResult.termsCount ?? 0,
          buildResult.checklistCount ?? 0,
        ),
        {
          terminal: true,
          mutation: 'applied',
          artifacts: { index_folder: wikiFolder },
        },
      )
    } catch (error) {
      return this.terminalToolFailure(text.reviewError(error))
    }
  }

  private async loadTreatyChecklist(wikiFolder: string): Promise<{
    path: string
    markdown: string
    items: ChecklistItem[]
    docId: string
    buildId: string
  }> {
    const path = normalizePath(`${wikiFolder}/_checklist.md`)
    if (!(await this.deps.app.vault.adapter.exists(path)))
      throw new Error(`File not found: ${path}`)
    const markdown = await this.deps.app.vault.adapter.read(path)
    const docId = getIndexProvenance(markdown)
    const buildId = frontmatterValue(markdown, 'build_id')
    if (!docId || !buildId)
      throw new Error(text.reviewCoordinatorText().invalidChecklist)
    const items = parseChecklist(markdown)
    const duplicates = duplicateChecklistIds(items)
    if (duplicates.length > 0) {
      throw new Error(
        text.duplicateIds(formatDuplicateChecklistIds(duplicates), true),
      )
    }
    return { path, markdown, items, docId, buildId }
  }

  async executeChecklistNext(
    runId: string,
    call: ToolCallRequest,
  ): Promise<AgentToolExecutionResult> {
    try {
      const args = parseToolArgs(call.arguments)
      const requestedFolder = args.index_folder ?? args.wiki_folder
      let folder =
        typeof requestedFolder === 'string'
          ? normalizePath(requestedFolder.trim()).replace(/\/$/, '')
          : ''
      let autoDiscovered = false
      if (!folder) {
        const discovered = await discoverIndexFolder(this.deps.app)
        if (!discovered)
          return this.terminalToolFailure(text.reviewCoordinatorText().noIndex)
        if ('candidates' in discovered)
          return this.terminalToolFailure(
            text.multipleIndexes(discovered.candidates),
          )
        folder = discovered.folder
        autoDiscovered = true
      }

      const checklist = await this.loadTreatyChecklist(folder)
      const requestedItemId =
        typeof args.item_id === 'string' ? args.item_id : undefined
      const item = resolveChecklistItem(checklist.markdown, requestedItemId)
      if (requestedItemId && !item)
        return this.terminalToolFailure(text.missingItem(requestedItemId))

      console.debug(
        `[ReviewIndex] executeChecklistNext entered: index_folder="${folder}", requested_item_id="${requestedItemId ?? '(none)'}", canonical_item_id="${item?.id ?? '(none)'}", canonical_item_state="${item?.state ?? '(none)'}"`,
      )

      let activeItem = item
      if (item && item.state !== 'pending') {
        const nextPending = checklist.items.find(
          (entry) => entry.state === 'pending',
        )
        if (nextPending) {
          activeItem = nextPending
          console.debug(
            `[ReviewIndex] Automatic advance detected: item_id=${item.id}(${item.state}) -> nextPendingId=${nextPending.id}`,
          )
        }
      }

      const rendered = await this.deps.localTools.execute('checklist_next', {
        ...args,
        index_folder: folder,
        ...(activeItem ? { item_id: activeItem.id } : {}),
      })
      if (rendered.kind === 'error')
        return this.terminalToolFailure(text.reviewError(rendered.message))
      if (rendered.kind !== 'read')
        return this.terminalToolFailure(
          text.reviewCoordinatorText().unexpectedChange,
        )

      const discoveryNotice = autoDiscovered
        ? text.discoveredFolder(folder)
        : ''
      if (!activeItem)
        return toolSucceeded(`${rendered.text}${discoveryNotice}`)
      return toolSucceeded(`${rendered.text}${discoveryNotice}`)
    } catch (error) {
      return this.terminalToolFailure(text.reviewError(error))
    }
  }

  private treatyBatchLedgerPath(wikiFolder: string): string {
    return normalizePath(`${wikiFolder}/${TREATY_BATCH_LEDGER_FILE}`)
  }

  private async loadTreatyBatchLedger(
    wikiFolder: string,
    checklist: TreatyChecklist,
    jobId: string,
  ): Promise<PersistedBatchLedger> {
    const path = this.treatyBatchLedgerPath(wikiFolder)
    const existing = (await this.deps.app.vault.adapter.exists(path))
      ? parseBatchLedger(await this.deps.app.vault.adapter.read(path))
      : null
    const existingById = new Map(
      existing?.buildId === checklist.buildId
        ? existing.entries.map((entry) => [entry.id, entry])
        : [],
    )
    const entries: BatchSliceLedgerEntry[] = []
    for (const item of checklist.items.filter((entry) =>
      entry.id.startsWith('R:'),
    )) {
      const unitPath = this.treatyPath(wikiFolder, item.target)
      if (!unitPath || !(await this.deps.app.vault.adapter.exists(unitPath)))
        continue
      const markdown = await this.deps.app.vault.adapter.read(unitPath)
      const inputHash =
        frontmatterValue(markdown, 'unit_hash') ??
        (await sha256Hex(stripMarkdownFrontmatter(markdown))).slice(0, 8)
      const bodyLineCount = Math.max(
        1,
        stripMarkdownFrontmatter(markdown).split(/\r?\n/).length,
      )
      const coverageUnit = {
        unitId: makeCoverageUnitId(unitPath, inputHash, 1, bodyLineCount),
        path: unitPath,
        startLine: 1,
        endLine: bodyLineCount,
        revisionHash: inputHash,
      }
      const previous = existingById.get(item.id)
      const sourceRevisionChanged =
        previous !== undefined && previous.inputHash !== inputHash
      const userRequeuedTerminal =
        item.state === 'pending' &&
        !sourceRevisionChanged &&
        previous &&
        [
          'done',
          'skipped',
          'needs_attention',
          'input_empty',
          'output_empty',
          'truncated',
          'stale_input',
          'apply_error',
          'protocol_error',
        ].includes(previous.status)
      const checklistStatus = sourceRevisionChanged
        ? null
        : item.state === 'done'
          ? previous?.status === 'input_empty' ||
            previous?.status === 'output_empty' ||
            previous?.status === 'truncated'
            ? previous.status
            : 'done'
          : item.state === 'skipped'
            ? previous?.status === 'needs_attention'
              ? 'needs_attention'
              : previous?.status === 'running'
                ? 'running'
                : 'skipped'
            : null
      const pendingStatus = userRequeuedTerminal
        ? 'pending'
        : sourceRevisionChanged
          ? 'pending'
          : (previous?.status ?? 'pending')
      entries.push({
        id: item.id,
        title: item.target,
        status: checklistStatus ?? pendingStatus,
        attempt:
          userRequeuedTerminal || sourceRevisionChanged
            ? 0
            : (previous?.attempt ?? 0),
        inputHash:
          userRequeuedTerminal || sourceRevisionChanged
            ? inputHash
            : (previous?.inputHash ?? inputHash),
        coverageUnit,
        ...(checklistStatus
          ? {}
          : previous?.lease && !userRequeuedTerminal && !sourceRevisionChanged
            ? { lease: previous.lease }
            : {}),
        ...(previous?.note && !userRequeuedTerminal && !sourceRevisionChanged
          ? { note: previous.note }
          : {}),
      })
    }
    let recovered = recoverExpiredBatchLeases(
      entries,
      new Date(),
      TREATY_BATCH_LEASE_TIMEOUT_MS,
    )
    recovered = recovered.map((entry) =>
      entry.status === 'running' && entry.lease?.jobId === jobId
        ? { ...entry, status: 'pending' as const, lease: undefined }
        : entry,
    )
    return synchronizeBatchCoverageLedger({
      schemaVersion: 2,
      buildId: checklist.buildId,
      jobId,
      updatedAt: new Date().toISOString(),
      entries: recovered,
    })
  }

  private async persistTreatyBatchLedger(
    runId: string,
    wikiFolder: string,
    ledger: PersistedBatchLedger,
    autoApply: boolean,
  ): Promise<boolean> {
    const change = await this.proposedWrite(
      this.treatyBatchLedgerPath(wikiFolder),
      renderBatchLedger(ledger),
      'submit_wiki_finding',
    )
    const outcomes = await this.applyTreatyBatch(
      runId,
      [change],
      autoApply,
      false,
    )
    return outcomes.every((outcome) => outcome.status === 'applied')
  }

  /**
   * Pack phase (§3.6): review several adjacent same-chapter atoms in one
   * stateless completion, demux the rows back to atoms by evidence provenance,
   * and commit per atom. Any pack-level failure simply returns its members to
   * `pending` — the atomic runner that follows is the fallback path, so this
   * phase can never lose an atom, only decline to batch it.
   */
  async runUnitBatch(input: {
    label?: string
    runId: string
    wikiFolder: string
    prompt: string
    inputBudget: number
    outputBudget: number
    autoApply: boolean
    batch?: BatchContract
    signal?: AbortSignal
    onTextUpdate?: (text: string) => void
  }): Promise<AgentLoopResult> {
    return this.batchRunner.runUnitBatch(input)
  }

  async executeSubmitFinding(
    runId: string,
    call: ToolCallRequest,
    autoApply = false,
    openAppliedNotes = true,
  ): Promise<AgentToolExecutionResult> {
    let folder = ''
    let itemId = ''
    let status: 'skipped' | 'done' | null = null
    let note: string | undefined
    let issues: number | undefined
    let findingsMarkdown = ''
    try {
      const args = parseToolArgs(call.arguments)
      const folderVal = args.index_folder ?? args.wiki_folder
      folder =
        typeof folderVal === 'string'
          ? normalizePath(folderVal).replace(/\/$/, '')
          : ''
      itemId = typeof args.item_id === 'string' ? args.item_id : ''
      status =
        args.status === 'skipped'
          ? 'skipped'
          : args.status === 'done'
            ? 'done'
            : null
      note = typeof args.note === 'string' ? args.note : undefined
      issues = typeof args.issues === 'number' ? args.issues : undefined
      findingsMarkdown =
        typeof args.findings_markdown === 'string' ? args.findings_markdown : ''
      if (!folder || !itemId || !status)
        throw new Error(text.reviewCoordinatorText().submitRequired)

      const submitResult = await this.deps.runtime.submitFinding({
        wikiFolder: folder,
        itemId,
        status,
        note,
        issues,
        findingsMarkdown,
      })
      if (submitResult.changes.length === 0) {
        return toolSucceeded(text.reviewCoordinatorText().processed, {
          terminal: true,
        })
      }

      const outcomes = await this.applyTreatyBatch(
        runId,
        submitResult.changes,
        autoApply,
        openAppliedNotes,
      )
      const applied = outcomes.filter(
        (outcome) => outcome.status === 'applied',
      ).length
      if (applied !== outcomes.length) {
        const { detail } = summarizeBatchOutcomes(outcomes)
        return this.terminalToolFailure(
          [text.submitPartial(applied, outcomes.length), detail].join('\n'),
          applied > 0,
        )
      }

      const validationWarningText =
        submitResult.validationWarnings &&
        submitResult.validationWarnings.length > 0
          ? text.validationWarnings(submitResult.validationWarnings)
          : ''

      return toolSucceeded(
        text.findingSubmitted(
          submitResult.canonicalItemId,
          status,
          submitResult.issues,
          validationWarningText,
          submitResult.progress.processed,
          submitResult.progress.total,
        ),
        { terminal: true, mutation: 'applied' },
      )
    } catch (error) {
      if (error instanceof FindingValidationError) {
        return this.terminalToolFailure(`(error: ${error.errors.join(' ')})`)
      }
      return this.terminalToolFailure(text.reviewError(error))
    }
  }

  async executeVerifyLinks(
    runId: string,
    call: ToolCallRequest,
    autoApply = false,
    openAppliedNotes = true,
  ): Promise<AgentToolExecutionResult> {
    try {
      const args = parseToolArgs(call.arguments)
      const folderVal = args.index_folder ?? args.wiki_folder
      const folder =
        typeof folderVal === 'string'
          ? normalizePath(folderVal).replace(/\/$/, '')
          : ''
      const output =
        typeof args.output_path === 'string'
          ? normalizePath(args.output_path)
          : ''
      const outputPath = this.treatyPath(
        folder,
        output.startsWith(`${folder}/`)
          ? output.slice(folder.length + 1)
          : output,
      )
      if (!folder || !outputPath)
        throw new Error(text.reviewCoordinatorText().outputPath)

      const auditResult = await this.deps.runtime.auditIndex({
        wikiFolder: folder,
        outputPath,
        runVerifyWikiLinks: async (f) => {
          const res = await this.deps.localTools.execute('verify_wiki_links', {
            wiki_folder: f,
          })
          return res.kind === 'read'
            ? { kind: res.kind, text: res.text, message: undefined }
            : res.kind === 'error'
              ? { kind: res.kind, text: '', message: res.message }
              : { kind: res.kind, text: '', message: undefined }
        },
      })

      const outcomes = await this.applyTreatyBatch(
        runId,
        auditResult.changes,
        autoApply,
        openAppliedNotes,
      )
      const applied = outcomes.filter(
        (outcome) => outcome.status === 'applied',
      ).length
      if (applied !== outcomes.length) {
        const { detail } = summarizeBatchOutcomes(outcomes)
        return this.terminalToolFailure(
          [text.auditPartial(applied, outcomes.length), detail].join('\n'),
          applied > 0,
        )
      }
      return toolSucceeded(text.auditApplied(outputPath), {
        terminal: true,
        mutation: 'applied',
      })
    } catch (error) {
      return this.terminalToolFailure(text.reviewError(error))
    }
  }

  async executeCompileReport(
    runId: string,
    call: ToolCallRequest,
    autoApply = false,
    openAppliedNotes = true,
  ): Promise<AgentToolExecutionResult> {
    try {
      const args = parseToolArgs(call.arguments)
      const folderVal = args.index_folder ?? args.wiki_folder
      const folder =
        typeof folderVal === 'string'
          ? normalizePath(folderVal).replace(/\/$/, '')
          : ''
      if (!folder) throw new Error(text.reviewCoordinatorText().indexFolder)

      const outputArg =
        typeof args.output_path === 'string' ? args.output_path : '_report.md'
      const relative = outputArg.startsWith(`${folder}/`)
        ? outputArg.slice(folder.length + 1)
        : outputArg
      const outputPath = this.treatyPath(folder, relative)
      if (!outputPath) throw new Error(text.reviewCoordinatorText().outputPath)

      const reportResult = await this.deps.runtime.compileReport({
        wikiFolder: folder,
        outputPath,
        summary: typeof args.summary === 'string' ? args.summary : undefined,
      })

      const outcomes = await this.applyTreatyBatch(
        runId,
        reportResult.changes,
        autoApply,
        openAppliedNotes,
      )
      const applied = outcomes.filter(
        (outcome) => outcome.status === 'applied',
      ).length
      if (applied !== outcomes.length) {
        const { detail } = summarizeBatchOutcomes(outcomes)
        return this.terminalToolFailure(
          [text.reportPartial(applied, outcomes.length), detail].join('\n'),
          applied > 0,
        )
      }
      const warning = reportResult.mismatches.length
        ? text.reportWarning(reportResult.mismatches)
        : ''
      return toolSucceeded(text.reportApplied(outputPath, warning), {
        terminal: true,
        mutation: 'applied',
      })
    } catch (error) {
      return this.terminalToolFailure(text.reviewError(error))
    }
  }
}
