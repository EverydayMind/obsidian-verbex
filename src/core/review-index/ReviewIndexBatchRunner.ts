import { App } from 'obsidian'

import { VerbexSettings } from '../../settings/schema/setting.types'
import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { ProposedChange } from '../../verbex/types'
import { ChangeOutcome } from '../../workflow/StepExecutor'
import { BatchContract } from '../batch/contracts'
import { runBatchJobEngine } from '../batch/engine'
import {
  BatchSliceLedgerEntry,
  BatchSliceStatus,
  PersistedBatchLedger,
  renderBatchLedger,
  runForegroundBatch,
  synchronizeBatchCoverageLedger,
} from '../batch/foregroundBatchRunner'
import {
  BatchPackRecord,
  DEFAULT_MAX_ATOMS_PER_SLICE,
  planBatchPacks,
  treatyPackBoundaryKey,
} from '../batch/slicePacking'
import { AgentLoopResult } from '../llm/agentLoop'
import { gatedChatStep } from '../llm/budgetGate'
import {
  PACK_FILL_RATIO_DEFAULT,
  computePackInputTarget,
  computePackOutputTokens,
  estimatePackOutputTokens,
} from '../llm/contextWindow'
import {
  FindingAggregation,
  findingAggregation,
  findingAggregationSummary,
} from '../tools/findingAggregation'
import {
  PackedReviewMember,
  buildPackedReviewEvidence,
  buildReviewEvidence,
  countIssueTableRows,
  demuxPackedFinding,
  renderFindingNote,
  renderPackedReviewEvidence,
  renderReviewEvidence,
  validateBatchFindingAgainstSource,
} from '../tools/findingMarkdown'
import { frontmatterValue } from '../tools/reviewIndexMetadata'
import {
  ChecklistItem,
  toggleChecklistItem,
  treatyReviewText,
} from '../tools/treatyWiki'

import {
  batchCompleted,
  batchLedgerFailed,
  batchMissingUnit,
  batchProgress,
  batchRegistration,
  batchRetry,
  batchStatusCounts,
  cappedProgressSummary,
  packApplyIncomplete,
  reviewBatchText,
} from './reviewBatchText'
import type { TreatyChecklist } from './ReviewIndexCoordinator'
import {
  TREATY_PACK_PACKET_RESERVE_TOKENS,
  TreatyBatchContextPacketBuilder,
  stripMarkdownFrontmatter,
} from './TreatyBatchContextPacketBuilder'
import {
  TreatySliceChangedError,
  assertTreatySliceFresh,
} from './treatySliceFreshness'

const TREATY_PACK_FRAMING_MARGIN_TOKENS = 512
const TREATY_PACK_GATE_SLACK_RATIO = 1.2
const FACT_STATUS_LABELS: Partial<Record<BatchSliceStatus, string>> = {
  done: 'done',
  input_empty: 'input_empty',
  output_empty: 'output_empty',
  truncated: 'truncated',
  stale_input: 'stale_input',
  apply_error: 'apply_error',
  protocol_error: 'protocol_error',
  needs_attention: 'needs_attention',
}

export type ReviewIndexBatchRunnerDeps = {
  app: App
  getSettings: () => VerbexSettings
  packetBuilder: TreatyBatchContextPacketBuilder
  treatyPath: (folder: string, relative: string) => string | null
  treatyBatchLedgerPath: (wikiFolder: string) => string
  persistTreatyBatchLedger: (
    runId: string,
    wikiFolder: string,
    ledger: PersistedBatchLedger,
    autoApply: boolean,
  ) => Promise<boolean>
  loadTreatyChecklist: (wikiFolder: string) => Promise<TreatyChecklist>
  loadTreatyBatchLedger: (
    wikiFolder: string,
    checklist: { items: ChecklistItem[]; buildId: string },
    jobId: string,
  ) => Promise<PersistedBatchLedger>
  proposedWrite: (
    path: string,
    content: string,
    tool: string,
  ) => Promise<ProposedChange>
  applyTreatyBatch: (
    runId: string,
    changes: ProposedChange[],
    autoApply: boolean,
    openAppliedNotes?: boolean,
  ) => Promise<ChangeOutcome[]>
}

/**
 * Pack + atomic review execution engine for treaty-wiki batch review.
 * Extracted from ReviewIndexCoordinator (B3) - runTreatyPackPhase groups
 * adjacent pending units into stateless multi-unit completions (§3.6),
 * runUnitBatch is the public entry point that runs the pack phase followed
 * by the atomic runner for whatever the pack phase declined or requeued.
 * Depends only on the narrow ReviewIndexBatchRunnerDeps surface (no run/
 * ledger state of its own) so it can be constructed once per Coordinator.
 */
export class ReviewIndexBatchRunner {
  constructor(private deps: ReviewIndexBatchRunnerDeps) {}

  /**
   * Pack phase (§3.6): review several adjacent same-chapter atoms in one
   * stateless completion, demux the rows back to atoms by evidence provenance,
   * and commit per atom. Any pack-level failure simply returns its members to
   * `pending` — the atomic runner that follows is the fallback path, so this
   * phase can never lose an atom, only decline to batch it.
   */
  private async runTreatyPackPhase(input: {
    aggregation: FindingAggregation
    runId: string
    wikiFolder: string
    prompt: string
    inputBudget: number
    outputBudget: number
    autoApply: boolean
    jobId: string
    knownWikiTargets: string[]
    ledger: PersistedBatchLedger
    emitProgress: (line: string) => void
    signal?: AbortSignal
  }): Promise<{
    ledger: PersistedBatchLedger
    completionCalls: number
    interrupted: boolean
  }> {
    let ledger = input.ledger
    let completionCalls = 0

    const persistOrThrow = async (next: PersistedBatchLedger) => {
      const normalized = synchronizeBatchCoverageLedger(next)
      if (
        !(await this.deps.persistTreatyBatchLedger(
          input.runId,
          input.wikiFolder,
          normalized,
          input.autoApply,
        ))
      ) {
        throw new Error(reviewBatchText().packLedgerFailed)
      }
      ledger = normalized
    }

    type PackMemberData = {
      entry: BatchSliceLedgerEntry
      markdown: string
      member: PackedReviewMember
    }
    const membersById = new Map<string, PackMemberData>()
    const candidates: {
      id: string
      boundaryKey: string
      tokens: number
    }[] = []
    for (const entry of ledger.entries) {
      if (entry.status !== 'pending') continue
      const path = this.deps.treatyPath(input.wikiFolder, entry.title)
      if (!path || !(await this.deps.app.vault.adapter.exists(path))) continue
      const markdown = await this.deps.app.vault.adapter.read(path)
      const inputHash =
        frontmatterValue(markdown, 'unit_hash') ??
        (await sha256Hex(stripMarkdownFrontmatter(markdown))).slice(0, 8)
      // A changed unit is not packable; the atomic runner surfaces the
      // hash-mismatch attention deterministically.
      if (inputHash !== entry.inputHash) continue
      const member: PackedReviewMember = {
        unitId: entry.id,
        title: entry.title,
        text: treatyReviewText(stripMarkdownFrontmatter(markdown)),
      }
      membersById.set(entry.id, { entry, markdown, member })
      candidates.push({
        id: entry.id,
        boundaryKey: treatyPackBoundaryKey(entry.id),
        tokens: estimateTokens(
          renderPackedReviewEvidence(
            [member],
            buildPackedReviewEvidence([member]),
          ),
        ),
      })
    }
    if (candidates.length < 2) {
      return {
        ledger,
        completionCalls,
        interrupted: false,
      }
    }

    const inputTarget = computePackInputTarget(input.inputBudget)
    const baseOverheadTokens =
      estimateTokens(
        this.deps.packetBuilder.adaptTreatyPackPrompt(input.prompt, []),
      ) +
      TREATY_PACK_PACKET_RESERVE_TOKENS +
      TREATY_PACK_FRAMING_MARGIN_TOKENS
    const plannedPacks = planBatchPacks({
      members: candidates,
      inputTarget,
      baseOverheadTokens,
      estimateOutputTokens: estimatePackOutputTokens,
      outputBudget: input.outputBudget,
    }).filter((pack) => pack.memberIds.length >= 2)
    const packPolicy = {
      version: 1 as const,
      mode: 'adjacent' as const,
      boundary: 'chapter' as const,
      fillRatio: PACK_FILL_RATIO_DEFAULT,
      maxAtomsPerSlice: DEFAULT_MAX_ATOMS_PER_SLICE,
    }
    let packSeq = ledger.packHistory?.length ?? 0

    const renderPack = async (memberIds: string[]) => {
      const members = memberIds
        .map((id) => membersById.get(id)?.member)
        .filter((member): member is PackedReviewMember => Boolean(member))
      const evidence = buildPackedReviewEvidence(members)
      const packet = await this.deps.packetBuilder.buildTreatyPackContextPacket(
        input.wikiFolder,
        memberIds
          .map((id) => membersById.get(id)?.markdown)
          .filter((markdown): markdown is string => Boolean(markdown)),
      )
      const system = this.deps.packetBuilder.adaptTreatyPackPrompt(
        input.prompt,
        members,
      )
      const user = [
        packet ? `${reviewBatchText().context}\n${packet}` : '',
        `${reviewBatchText().packSource}\n${renderPackedReviewEvidence(members, evidence)}`,
      ]
        .filter(Boolean)
        .join('\n\n')
      return {
        members,
        evidence,
        system,
        user,
        tokens: estimateTokens(system) + estimateTokens(user),
      }
    }

    const doneCount = () =>
      ledger.entries.filter((entry) => entry.status === 'done').length

    for (const planned of plannedPacks) {
      if (input.signal?.aborted) {
        return {
          ledger,
          completionCalls,
          interrupted: true,
        }
      }
      // Final gate (§3.6-2): the arithmetic plan used a packet reserve; measure
      // the actually rendered request and shed trailing members until it fits.
      const memberIds = [...planned.memberIds]
      let rendered = await renderPack(memberIds)
      const gateCeiling = Math.min(
        input.inputBudget,
        Math.floor(inputTarget * TREATY_PACK_GATE_SLACK_RATIO),
      )
      while (memberIds.length > 1 && rendered.tokens > gateCeiling) {
        memberIds.pop()
        rendered = await renderPack(memberIds)
      }
      if (memberIds.length < 2) continue

      const leaseAt = new Date().toISOString()
      await persistOrThrow({
        ...ledger,
        updatedAt: leaseAt,
        entries: ledger.entries.map((entry) =>
          memberIds.includes(entry.id)
            ? {
                ...entry,
                status: 'running' as const,
                attempt: entry.attempt + 1,
                lease: { jobId: input.jobId, acquiredAt: leaseAt },
                note: undefined,
              }
            : entry,
        ),
      })

      packSeq += 1
      const packId = `${input.jobId}:P${packSeq}`
      const memberHashes = Object.fromEntries(
        memberIds.map((id) => [id, membersById.get(id)?.entry.inputHash ?? '']),
      )
      const compositeHash = (
        await sha256Hex(memberIds.map((id) => memberHashes[id]).join('|'))
      ).slice(0, 8)
      const packRecord = (
        outcome: BatchPackRecord['outcome'],
        failure?: BatchPackRecord['failure'],
        modelId?: string,
      ): BatchPackRecord => ({
        packId,
        memberIds,
        memberHashes,
        compositeHash,
        policy: packPolicy,
        ...(modelId ? { modelId } : {}),
        promptTokens: rendered.tokens,
        attempts: 1,
        outcome,
        ...(failure ? { failure } : {}),
        completedAt: new Date().toISOString(),
      })
      const atomize = async (
        note: string,
        record: BatchPackRecord,
        ids: string[] = memberIds,
      ) => {
        input.emitProgress(batchRetry(note, ids))
        await persistOrThrow({
          ...ledger,
          updatedAt: new Date().toISOString(),
          packHistory: [...(ledger.packHistory ?? []), record],
          entries: ledger.entries.map((entry) =>
            ids.includes(entry.id)
              ? {
                  ...entry,
                  status: 'pending' as const,
                  lease: undefined,
                  note,
                }
              : entry,
          ),
        })
      }

      let step: Awaited<ReturnType<typeof gatedChatStep>> | null = null
      for (let attempt = 1; attempt <= 2 && !step; attempt += 1) {
        try {
          step = await gatedChatStep({
            settings: this.deps.getSettings(),
            requiredBlocks: [
              { role: 'system', content: rendered.system },
              { role: 'user', content: rendered.user },
            ],
            reasoningEffort: 'none',
            temperature: 0,
            maxTokens: computePackOutputTokens(
              input.outputBudget,
              memberIds.length,
            ),
            inputBudget: input.inputBudget,
            options: input.signal ? { signal: input.signal } : undefined,
          })
          completionCalls += 1
        } catch (error) {
          if (input.signal?.aborted) {
            return {
              ledger,
              completionCalls,
              interrupted: true,
            }
          }
          if (attempt === 2) {
            await atomize(
              reviewBatchText().callFailed,
              packRecord('atomized', {
                kind: 'transport',
                detail: error instanceof Error ? error.message : String(error),
              }),
            )
          }
        }
      }
      if (!step) continue

      const demux = demuxPackedFinding(
        step.text,
        rendered.members,
        rendered.evidence,
      )
      const globalFailure =
        step.finishReason === 'length'
          ? ('truncation' as const)
          : demux.parseFailed
            ? ('parse' as const)
            : demux.unattributableRows.length > 0
              ? ('unattributable' as const)
              : null
      if (globalFailure) {
        await atomize(
          `pack ${globalFailure}`,
          packRecord(
            'atomized',
            {
              kind: globalFailure,
              ...(demux.unattributableRows.length > 0
                ? { detail: `${demux.unattributableRows.length} rows` }
                : {}),
            },
            step.modelId,
          ),
        )
        continue
      }

      const successes: { id: string; body: string; issues: number }[] = []
      const requeue: { id: string; note: string }[] = []
      for (const member of rendered.members) {
        const result = demux.perUnit.get(member.unitId)
        if (!result) {
          requeue.push({
            id: member.unitId,
            note: reviewBatchText().missingEnvelope,
          })
          continue
        }
        const errors = validateBatchFindingAgainstSource(
          result.body,
          member.text,
          input.knownWikiTargets,
        )
        if (errors.length > 0) {
          requeue.push({
            id: member.unitId,
            note: `${reviewBatchText().validationFailed} ${errors.join('; ')}`,
          })
          continue
        }
        successes.push({
          id: member.unitId,
          body: result.body,
          issues: result.issues,
        })
      }
      if (successes.length === 0) {
        await atomize(
          reviewBatchText().allInvalid,
          packRecord('atomized', { kind: 'member_errors' }, step.modelId),
        )
        continue
      }

      const fresh = await this.deps.loadTreatyChecklist(input.wikiFolder)
      let checklistMarkdown = fresh.markdown
      const changes: ProposedChange[] = []
      const committedIds: string[] = []
      for (const success of successes) {
        const item = fresh.items.find((value) => value.id === success.id)
        const artifactPath = item?.artifact
          ? this.deps.treatyPath(input.wikiFolder, item.artifact)
          : null
        if (!artifactPath) {
          requeue.push({
            id: success.id,
            note: reviewBatchText().missingArtifact,
          })
          continue
        }
        const toggled = toggleChecklistItem(
          checklistMarkdown,
          success.id,
          'done',
          `issues=${success.issues}`,
        )
        if (toggled.markdown) checklistMarkdown = toggled.markdown
        else if (!toggled.alreadyState) {
          requeue.push({
            id: success.id,
            note: reviewBatchText().checklistFailed,
          })
          continue
        }
        const data = membersById.get(success.id)
        changes.push(
          await this.deps.proposedWrite(
            artifactPath,
            renderFindingNote({
              docId: fresh.docId,
              unitOrderKey: success.id.replace(/^R:/, ''),
              buildId: fresh.buildId,
              unitHash: data?.entry.inputHash ?? '',
              issues: success.issues,
              body: success.body,
            }),
            'submit_wiki_finding',
          ),
        )
        committedIds.push(success.id)
      }
      if (committedIds.length === 0) {
        await atomize(
          reviewBatchText().nothingToCommit,
          packRecord('atomized', { kind: 'member_errors' }, step.modelId),
        )
        continue
      }
      if (checklistMarkdown !== fresh.markdown) {
        changes.push(
          await this.deps.proposedWrite(
            fresh.path,
            checklistMarkdown,
            'submit_wiki_finding',
          ),
        )
      }
      const record = packRecord(
        requeue.length === 0 ? 'committed' : 'partial',
        requeue.length > 0
          ? {
              kind: 'member_errors',
              detail: requeue.map((value) => value.id).join(', '),
            }
          : undefined,
        step.modelId,
      )
      const nextLedger = synchronizeBatchCoverageLedger({
        ...ledger,
        updatedAt: new Date().toISOString(),
        packHistory: [...(ledger.packHistory ?? []), record],
        entries: ledger.entries.map((entry) => {
          if (committedIds.includes(entry.id)) {
            return {
              ...entry,
              status: 'done' as const,
              lease: undefined,
              note: undefined,
            }
          }
          const requeued = requeue.find((value) => value.id === entry.id)
          if (requeued) {
            return {
              ...entry,
              status: 'pending' as const,
              lease: undefined,
              note: requeued.note,
            }
          }
          return entry
        }),
      })
      changes.push(
        await this.deps.proposedWrite(
          this.deps.treatyBatchLedgerPath(input.wikiFolder),
          renderBatchLedger(nextLedger),
          'submit_wiki_finding',
        ),
      )
      const outcomes = await this.deps.applyTreatyBatch(
        input.runId,
        changes,
        input.autoApply,
        false,
      )
      if (outcomes.every((outcome) => outcome.status === 'applied')) {
        ledger = nextLedger
        const total = ledger.entries.length
        for (const success of successes.filter((value) =>
          committedIds.includes(value.id),
        )) {
          input.emitProgress(
            `${doneCount()}/${total} ${membersById.get(success.id)?.entry.title ?? success.id} — ${findingAggregationSummary(success.body, input.aggregation)}`,
          )
        }
        for (const requeued of requeue) {
          input.emitProgress(`${requeued.id} — ${requeued.note}`)
        }
      } else {
        // Mirror the atomic commit contract: on a partial apply the members
        // stay running with their lease; recovery re-queues them next run.
        input.emitProgress(packApplyIncomplete(packId))
      }
    }
    return {
      ledger,
      completionCalls,
      interrupted: false,
    }
  }

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
    const checklist = await this.deps.loadTreatyChecklist(input.wikiFolder)
    const aggregation = findingAggregation(
      frontmatterValue(checklist.markdown, 'schema_columns'),
    )
    const batchLabel = input.label ?? reviewBatchText().label
    const jobId = `${input.runId}:unit_review`
    let ledger = await this.deps.loadTreatyBatchLedger(
      input.wikiFolder,
      checklist,
      jobId,
    )
    ledger = synchronizeBatchCoverageLedger(ledger)
    if (
      !(await this.deps.persistTreatyBatchLedger(
        input.runId,
        input.wikiFolder,
        ledger,
        input.autoApply,
      ))
    ) {
      throw new Error(reviewBatchText().initFailed)
    }

    const checklistRIds = checklist.items
      .filter((item) => item.id.startsWith('R:'))
      .map((item) => item.id)
    const ledgerIds = new Set(ledger.entries.map((entry) => entry.id))
    const missingLedgerItems = checklistRIds.filter((id) => !ledgerIds.has(id))

    const progressLines: string[] = []
    const retry = input.batch?.retry
    const maxAttempts = retry?.max_attempts ?? 2
    const emitProgress = (line: string) => {
      progressLines.push(line)
      input.onTextUpdate?.(
        [batchProgress(batchLabel), '', ...progressLines].join('\n'),
      )
    }
    const totalChecklistR = checklistRIds.length
    const registeredR = ledger.entries.length
    if (missingLedgerItems.length > 0) {
      emitProgress(
        batchRegistration(totalChecklistR, registeredR, missingLedgerItems),
      )
    }
    // Facts-not-judgments Phase 1: packed slices stay disabled for unit_review.
    // Every pending unit flows through the atom-level harness-stamped path.
    const engineResult = await runBatchJobEngine({
      // Treaty SKILL.md makes the human-editable checklist authoritative. The
      // engine receives that choice explicitly and does not reinterpret it.
      stateAuthority: 'checklist',
      signal: input.signal,
      initialState: ledger,
      runAtomic: async (state) => {
        ledger = state
        const result = await runForegroundBatch({
          jobId,
          entries: ledger.entries,
          signal: input.signal,
          maxAttempts,
          loadSlice: async (entry) => {
            const path = this.deps.treatyPath(input.wikiFolder, entry.title)
            if (!path || !(await this.deps.app.vault.adapter.exists(path)))
              throw new Error(batchMissingUnit(entry.title))
            const markdown = await this.deps.app.vault.adapter.read(path)
            const reviewBody = treatyReviewText(
              stripMarkdownFrontmatter(markdown),
            )
            const packet =
              await this.deps.packetBuilder.buildTreatyBatchContextPacket(
                input.wikiFolder,
                markdown,
              )
            return {
              body: reviewBody,
              inputHash:
                frontmatterValue(markdown, 'unit_hash') ??
                (await sha256Hex(stripMarkdownFrontmatter(markdown))).slice(
                  0,
                  8,
                ),
              contextPacket: packet.text,
              packetDeps: packet.packetDeps,
            }
          },
          completeSlice: async ({ entry, slice }) => {
            const evidence = buildReviewEvidence(slice.body)
            const step = await gatedChatStep({
              settings: this.deps.getSettings(),
              requiredBlocks: [
                {
                  role: 'system',
                  content: this.deps.packetBuilder.adaptTreatyBatchPrompt(
                    input.prompt,
                    entry.title,
                  ),
                },
                {
                  role: 'user',
                  content: [
                    slice.contextPacket
                      ? `${reviewBatchText().context}\n${slice.contextPacket}`
                      : '',
                    `${reviewBatchText().source}\n${renderReviewEvidence(evidence)}`,
                  ]
                    .filter(Boolean)
                    .join('\n\n'),
                },
              ],
              reasoningEffort: 'none',
              temperature: 0,
              maxTokens: Math.min(input.outputBudget, 4_096),
              inputBudget: input.inputBudget,
              options: input.signal ? { signal: input.signal } : undefined,
            })
            await assertTreatySliceFresh({
              app: this.deps.app,
              path: this.deps.treatyPath(input.wikiFolder, entry.title),
              wikiFolder: input.wikiFolder,
              builder: this.deps.packetBuilder,
              slice,
              signal: input.signal,
            })
            return {
              text: step.text.replace(/\r\n?/g, '\n'),
              finishReason: step.finishReason,
            }
          },
          classifyInput: ({ slice }) =>
            slice.body.trim().length === 0
              ? {
                  status: 'input_empty',
                  note: 'empty input body',
                }
              : undefined,
          classifyOutcome: (event) => {
            if (event.stage === 'input') {
              return {
                status: 'stale_input',
                note: `input hash changed: expected ${event.expectedHash}, got ${event.actualHash}`,
              }
            }
            if (event.stage === 'completion_error') {
              if (event.error instanceof TreatySliceChangedError)
                return {
                  status: 'stale_input',
                  note: event.error.message,
                  errors: [event.error.message],
                }
              const message =
                event.error instanceof Error
                  ? event.error.message
                  : String(event.error)
              return {
                status: 'protocol_error',
                note: message,
                errors: [message],
              }
            }
            if (event.stage === 'completion') {
              if (event.completion.finishReason === 'length') {
                return {
                  status: 'truncated',
                  note: 'finish_reason=length',
                  errors: ['finish_reason=length'],
                }
              }
              if (event.completion.text.trim().length === 0) {
                return {
                  status: 'output_empty',
                  note: 'empty model output',
                  errors: ['empty model output'],
                }
              }
              return undefined
            }
            if (event.stage === 'commit') {
              return {
                status: 'apply_error',
                note: `commit ${event.commit}`,
                errors: [`commit ${event.commit}`],
              }
            }
            return undefined
          },
          persistEntry: async (entry) => {
            const nextLedger = synchronizeBatchCoverageLedger({
              ...ledger,
              updatedAt: new Date().toISOString(),
              entries: ledger.entries.map((value) =>
                value.id === entry.id ? entry : value,
              ),
            })
            if (
              !(await this.deps.persistTreatyBatchLedger(
                input.runId,
                input.wikiFolder,
                nextLedger,
                input.autoApply,
              ))
            ) {
              throw new Error(batchLedgerFailed(entry.id))
            }
            ledger = nextLedger
          },
          commitSlice: async ({ output, entry, completedEntry }) => {
            const fresh = await this.deps.loadTreatyChecklist(input.wikiFolder)
            const item = fresh.items.find((value) => value.id === entry.id)
            if (!item?.artifact) return 'failed'
            const artifactPath = this.deps.treatyPath(
              input.wikiFolder,
              item.artifact,
            )
            if (!artifactPath) return 'failed'
            const toggled = toggleChecklistItem(
              fresh.markdown,
              entry.id,
              'done',
              [
                `status=${completedEntry.status}`,
                `issues≈${countIssueTableRows(output)}`,
              ].join(' '),
            )
            if (!toggled.markdown && !toggled.alreadyState) return 'failed'
            const nextLedger = synchronizeBatchCoverageLedger({
              ...ledger,
              updatedAt: new Date().toISOString(),
              entries: ledger.entries.map((value) =>
                value.id === entry.id ? completedEntry : value,
              ),
            })
            const changes = [
              await this.deps.proposedWrite(
                artifactPath,
                renderFindingNote({
                  docId: fresh.docId,
                  unitOrderKey: entry.id.replace(/^R:/, ''),
                  buildId: fresh.buildId,
                  unitHash: entry.inputHash,
                  issues: countIssueTableRows(output),
                  body: output,
                  status:
                    completedEntry.status === 'output_empty' ||
                    completedEntry.status === 'truncated'
                      ? completedEntry.status === 'output_empty'
                        ? 'empty'
                        : 'truncated'
                      : 'done',
                  attempts: completedEntry.attempt,
                }),
                'submit_wiki_finding',
              ),
              ...(toggled.markdown
                ? [
                    await this.deps.proposedWrite(
                      fresh.path,
                      toggled.markdown,
                      'submit_wiki_finding',
                    ),
                  ]
                : []),
              await this.deps.proposedWrite(
                this.deps.treatyBatchLedgerPath(input.wikiFolder),
                renderBatchLedger(nextLedger),
                'submit_wiki_finding',
              ),
            ]
            const outcomes = await this.deps.applyTreatyBatch(
              input.runId,
              changes,
              input.autoApply,
              false,
            )
            const applied = outcomes.filter(
              (outcome) => outcome.status === 'applied',
            ).length
            if (applied === outcomes.length) {
              ledger = nextLedger
              return 'applied'
            }
            return applied > 0 ? 'partial' : 'failed'
          },
          onProgress: ({ entry, index, total, output, errors }) => {
            if (
              entry.status === 'done' ||
              entry.status === 'input_empty' ||
              entry.status === 'output_empty' ||
              entry.status === 'truncated'
            ) {
              const label = FACT_STATUS_LABELS[entry.status] ?? entry.status
              emitProgress(
                `${index}/${total} ${entry.title} — ${label} — ${findingAggregationSummary(output ?? '', aggregation)}`,
              )
            } else if (
              entry.status === 'needs_attention' ||
              entry.status === 'stale_input' ||
              entry.status === 'apply_error' ||
              entry.status === 'protocol_error'
            ) {
              const label = FACT_STATUS_LABELS[entry.status] ?? entry.status
              emitProgress(
                `${index}/${total} ${entry.title} — ${label}: ${(errors ?? [entry.note]).filter(Boolean).join('; ')}`,
              )
            }
          },
        })
        return {
          state: ledger,
          value: result,
          completionCalls: result.completionCalls,
          interrupted: result.interrupted,
        }
      },
    })
    const result = engineResult.atomic
    const factualErrors =
      result.statusCounts.stale_input +
      result.statusCounts.apply_error +
      result.statusCounts.protocol_error
    const finalText = [
      batchCompleted(batchLabel, result.completed, result.entries.length),
      ...(missingLedgerItems.length > 0
        ? [batchRegistration(totalChecklistR, registeredR, missingLedgerItems)]
        : []),
      batchStatusCounts(result.statusCounts, result.needsAttention),
      ...(result.completedWithAttention
        ? [reviewBatchText().legacyAttention]
        : []),
      ...(factualErrors > 0 ? [reviewBatchText().rerun] : []),
      ...(result.interrupted ? [reviewBatchText().interrupted] : []),
      '',
      ...cappedProgressSummary(progressLines),
    ].join('\n')
    input.onTextUpdate?.(finalText)
    return {
      mutations: [],
      messages: [{ role: 'assistant', content: finalText }],
      finalText,
      iterations: engineResult.completionCalls,
      toolCalls: [],
      stoppedReason: 'completed',
      evidence: { discoveredPaths: [], inspectedPaths: [] },
      coverage: ledger.coverageLedger,
    }
  }
}
