import { App, TFile, normalizePath } from 'obsidian'

import { effectiveContextBudget } from '../../context/effectiveContextBudget'
import { t } from '../../i18n'
import { getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { RunArtifactStore } from '../../runstate/RunArtifactStore'
import { aiPrivateErrorOutcome } from '../../security/aiPrivateRefusal'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { RequestMessage } from '../../types/llm/request'
import { ToolCallRequest } from '../../types/tool-call.types'
import { sha256Hex } from '../../utils/hash'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { tokenCount } from '../../utils/llm/token'
import {
  AttachmentDigest,
  ProposedChange,
  VerbexRunState,
} from '../../verbex/types'
import { ChangeOutcome, StepExecutor } from '../../workflow/StepExecutor'
import { runGenericAnalysisJob } from '../batch/analysisAdapter'
import { JobStoreFileAdapter, JournalJobStore } from '../batch/jobStore'
import { runGenericTransformJob } from '../batch/transformAdapter'
import { AgentLoopStatus, AgentToolExecutionResult } from '../llm/agentLoop'
import { gatedChatStep } from '../llm/budgetGate'
import {
  computeInputBudget,
  computeMapReduceOutputBudget,
  computeOutputBudget,
  resolveContextWindow,
} from '../llm/contextWindow'
import {
  estimateMapChunkCount,
  mapReduceDocument,
  selectAttachmentsToDigest,
} from '../llm/documentMapReduce'
import { transformLargeDocument } from '../llm/documentTransform'
import { getChatModelClient } from '../llm/manager'
import { resolveChatModelId } from '../llm/modelSelection'
import { toolFailed, toolRejected, toolSucceeded } from '../llm/toolOutcome'
import {
  type EvidenceRecord,
  isCoverageSatisfied,
  parseEvidenceRecords,
  reduceEvidenceRecords,
  renderEvidenceRecordsForPrompt,
} from '../routing/evidenceRecords'
import {
  CoverageDecision,
  decideRequestScope,
  formatCoverageDecision,
  isStructuralExtractionIntent,
} from '../routing/scopeDecision'
import { LocalToolRegistry } from '../tools/localTools'
import {
  PREAMBLE_CHAPTER_PATTERN,
  sectionsByPattern,
  splitLines,
} from '../tools/noteSlicing'

import * as largeDocumentText from './largeDocumentText'
import { LargeSource, readLargeSource } from './largeSourcePort'

export type PreparedAttachments = {
  smallFiles: TFile[]
  digests: AttachmentDigest[]
  listOnlyFiles: TFile[]
}
export type LargeOperationConfirmation = {
  path: string
  operation: 'analysis' | 'transform'
  estimatedChunks: number
}
export type LargeOperationConfirm = (
  info: LargeOperationConfirmation,
) => Promise<boolean>

export type LargeDocumentCoordinatorDeps = {
  app: App
  getSettings: () => VerbexSettings
  loadRunForUpdate: (runId: string, title: string) => Promise<VerbexRunState>
  updateRunArtifacts: (
    runId: string,
    mutate: (run: VerbexRunState) => VerbexRunState,
    title?: string,
  ) => Promise<void>
  localTools: LocalToolRegistry
  stepExecutor: StepExecutor
  recordToolOutcome: (runId: string, outcome: ChangeOutcome) => Promise<void>
}

function renderDigestEvidence(records: EvidenceRecord[]): string {
  const allUnitIds = records.map((record) => record.unitId)
  const unresolved = records.filter((record) => !isCoverageSatisfied(record))
  const selected = unresolved.slice(0, DIGEST_EVIDENCE_RECORD_HARD_CAP)
  const summary = reduceEvidenceRecords({
    records,
    plannedUnitIds: allUnitIds,
    deliveredUnitIds: selected.map((record) => record.unitId),
  }).summary
  return renderEvidenceRecordsForPrompt(
    { records: selected, summary },
    { compact: true },
  )
}

const LARGE_DOCUMENT_GUIDANCE_MAX_CHARS = 10_000
const MAP_REDUCE_MAX_CONTINUATIONS = 2
const DIGEST_EVIDENCE_RECORD_HARD_CAP = 4

function buildLargeDocumentAnalysisTask(
  request: string,
  guidance?: string | null,
  evidenceOnly = false,
): string {
  const trimmed = guidance?.trim()
  if (!trimmed) return request
  const compactGuidance =
    trimmed.length <= LARGE_DOCUMENT_GUIDANCE_MAX_CHARS
      ? trimmed
      : L({
          ko: `${trimmed.slice(0, LARGE_DOCUMENT_GUIDANCE_MAX_CHARS / 2)}\n\n[중간 지침 생략: 분할 처리 예산 보호]\n\n${trimmed.slice(-LARGE_DOCUMENT_GUIDANCE_MAX_CHARS / 2)}`,
          en: `${trimmed.slice(0, LARGE_DOCUMENT_GUIDANCE_MAX_CHARS / 2)}

[Middle guidance omitted to protect the split-processing budget]

${trimmed.slice(-LARGE_DOCUMENT_GUIDANCE_MAX_CHARS / 2)}`,
        })
  return [
    L({
      ko: `# 사용자 요청\n${request}`,
      en: `# User request
${request}`,
    }),
    evidenceOnly
      ? L({
          ko: '# Controller가 확정한 현재 단계의 근거 추출 계약',
          en: '# Evidence extraction contract for the current stage confirmed by the Controller',
        })
      : L({
          ko: '# 선택된 Skill/Workflow 지침 (필수)',
          en: '# Selected Skill/Workflow guidance (required)',
        }),
    compactGuidance,
    evidenceOnly
      ? L({
          ko: '# 근거 레코드 출력 계약',
          en: '# Evidence record output contract',
        })
      : L({
          ko: '# 분할 처리 실행 규칙',
          en: '# Split-processing execution rules',
        }),
    evidenceOnly
      ? [
          L({
            ko: '- 각 항목에 조각 번호와 원문 라인 범위, 조항 번호, 정확 인용, 문제 유형, 근거 기반 판단, 미검토 범위를 기록합니다.',
            en: '- Record the chunk number, source line range, article number, exact quote, issue type, evidence-based assessment, and unreviewed scope for each item.',
          }),
          L({
            ko: '- 원문에 없는 판단을 만들지 않고, 정확 인용에 생략부호(...)를 사용하지 않습니다.',
            en: '- Do not invent assessments absent from the source, and do not use ellipses (...) in exact quotes.',
          }),
          L({
            ko: '- 다음 단계 질문, 사용자 승인 해석, 최종 보고서 작성, 단계 선택 또는 단계 선언을 출력하지 않습니다.',
            en: '- Do not output next-stage questions, interpretations of user approval, final report writing, stage selection, or stage declarations.',
          }),
        ].join('\n')
      : [
          L({
            ko: '- 선택된 지침이 요구하는 검토 목적, 현재 단계, 점검 항목, 출력 형식을 그대로 수행합니다.',
            en: '- Follow the review purpose, current stage, checklist, and output format required by the selected guidance.',
          }),
          L({
            ko: '- 자구·문장·법률문안 검토를 내용 설명이나 요약으로 대체하지 않습니다.',
            en: '- Do not replace wording, sentence, or legal drafting review with content explanation or summary.',
          }),
          L({
            ko: '- 단계형 워크플로에서는 현재 요청에 해당하는 한 단계만 수행하고 다음 단계를 미리 수행하거나 최종 검토서로 건너뛰지 않습니다.',
            en: '- In a staged workflow, perform only the stage corresponding to the current request; do not perform later stages in advance or skip to the final review report.',
          }),
        ].join('\n'),
  ].join('\n\n')
}

export class LargeDocumentCoordinator {
  constructor(private deps: LargeDocumentCoordinatorDeps) {}

  formatResultBadge(
    digests: AttachmentDigest[],
    decision?: CoverageDecision,
  ): string | null {
    if (digests.length === 0) return null
    const totalChunks = digests.reduce(
      (sum, digest) => sum + digest.chunkCount,
      0,
    )
    if (totalChunks === 0) return null
    const scope =
      digests.length === 1
        ? t('largeDocumentBadge.singleScope', {
            p0: digests[0].path.split('/').pop() ?? digests[0].path,
            p1: totalChunks,
          })
        : t('largeDocumentBadge.multiScope', {
            p0: digests.length,
            p1: totalChunks,
          })
    const decisionText = decision
      ? ` · ${formatCoverageDecision(decision)}`
      : ''
    const verification = digests.some((digest) => digest.sequentialVerification)
      ? t('largeDocumentBadge.verified')
      : ''
    const warning = digests.some((digest) => digest.projection?.truncated)
      ? t('largeDocumentBadge.projectionWarning')
      : digests.some((digest) => digest.truncated)
        ? t('largeDocumentBadge.outputWarning')
        : ''
    return t('largeDocumentBadge.badge', {
      p0: scope,
      p1: decisionText,
      p2: verification,
      p3: warning,
    })
  }

  formatDigests(digests: AttachmentDigest[]): string {
    const sections = digests.map((digest) => {
      const label =
        digest.source === 'current_note'
          ? L({
              ko: '대용량 현재 노트 통합 분석',
              en: 'Integrated analysis of the large current note',
            })
          : L({
              ko: '대용량 첨부 파일 통합 분석',
              en: 'Integrated analysis of a large attachment',
            })
      const evidence = digest.evidenceRecords?.length
        ? `\n\n${renderDigestEvidence(digest.evidenceRecords)}`
        : ''
      const projection = digest.projection
        ? L({
            ko: `\n투영: disk projection sourceSha256=${digest.projection.revision.slice(0, 12)} schema=v${digest.projection.schemaVersion}; 줄 번호는 투영 기준이며 원본 쪽/문단 번호가 아닙니다.${digest.projection.truncated ? ' 추출이 잘려 원본 전체 coverage가 아닙니다.' : ''}`,
            en: `
Projection: disk projection sourceSha256=${digest.projection.revision.slice(0, 12)} schema=v${digest.projection.schemaVersion}; line numbers refer to the projection, not source page/paragraph numbers.${digest.projection.truncated ? largeDocumentText.partialProjection() : ''}`,
          })
        : ''
      return L({
        ko: `## ${label} (map-reduce, ${digest.chunkCount}개 조각)\n출처: ${digest.path}${projection}${evidence}\n\n${digest.text}`,
        en: `## ${label} (map-reduce, ${digest.chunkCount} chunks)
Source: ${digest.path}${projection}${evidence}

${digest.text}`,
      })
    })
    return L({
      ko: `다음은 컨텍스트 예산보다 커서 전체를 분할 처리한 파일에 대해, 선택된 Skill/Workflow의 현재 단계와 출력 형식을 적용해 만든 통합 결과입니다. 이 결과를 현재 단계의 산출물로 사용자에게 제시하세요. 내용 요약으로 다시 바꾸거나 같은 단계를 아직 시작하지 않은 것처럼 묻지 마세요. 단계별 확인이 필요하면 현재 결과를 먼저 제시한 뒤 다음 단계 진행 여부만 물으세요. 원문 전체를 다시 읽으려 하지 마세요:\n\n${sections.join('\n\n')}`,
      en: `The following is an integrated result for files exceeding the context budget, processed in full in chunks using the current stage and output format of the selected Skill/Workflow. Present this result to the user as the deliverable for the current stage. Do not turn it back into a content summary or ask as though this stage has not started. If stage-by-stage confirmation is needed, present the current result first, then ask only whether to proceed to the next stage. Do not attempt to read the entire source again:

${sections.join('\n\n')}`,
    })
  }

  formatSourceInventory(
    files: TFile[],
    toolName: string,
    formatSize: (bytes: number) => string,
  ): string | null {
    const unique = [...new Map(files.map((file) => [file.path, file])).values()]
    if (unique.length === 0) return null
    return [
      L({
        ko: '## 서버측 도구 입력 파일',
        en: '## Server-side tool input files',
      }),
      L({
        ko: `다음 대용량 파일의 본문은 컨텍스트에 포함하지 않았습니다. 경로를 ${toolName} 도구에 그대로 전달하십시오. 원문을 요약하거나 직접 읽지 마십시오.`,
        en: `The bodies of the following large files were not included in the context. Pass their paths unchanged to the ${toolName} tool. Do not summarize or read the sources directly.`,
      }),
      ...unique.map((file) =>
        L({
          ko: `- [목록만] ${file.path} (${formatSize(file.stat.size)})`,
          en: `- [List only] ${file.path} (${formatSize(file.stat.size)})`,
        }),
      ),
    ].join('\n')
  }

  async splitByChapters(
    runId: string,
    call: ToolCallRequest,
  ): Promise<AgentToolExecutionResult> {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.arguments ?? '{}') as Record<string, unknown>
    } catch {
      return toolFailed(
        L({
          ko: '(오류: split_file_by_chapters arguments must be valid JSON.)',
          en: '(Error: split_file_by_chapters arguments must be valid JSON.)',
        }),
      )
    }
    const sourcePath =
      typeof args.source_path === 'string'
        ? normalizePath(args.source_path.trim())
        : ''
    const outputFolder =
      typeof args.output_folder === 'string'
        ? normalizePath(args.output_folder.trim()).replace(/\/$/, '')
        : ''
    if (!sourcePath || !outputFolder) {
      return toolFailed(
        L({
          ko: '(오류: split_file_by_chapters requires source_path and output_folder.)',
          en: '(Error: split_file_by_chapters requires source_path and output_folder.)',
        }),
      )
    }
    const file = this.deps.app.vault.getFileByPath(sourcePath)
    if (!file || !('extension' in file) || file.extension !== 'md') {
      return toolFailed(
        L({
          ko: `(오류: Markdown file not found: ${sourcePath})`,
          en: `(Error: Markdown file not found: ${sourcePath})`,
        }),
      )
    }

    let source: string
    try {
      source = (await readLargeSource(this.deps.app, file)).text
    } catch (error) {
      const refusal = aiPrivateErrorOutcome(error)
      if (refusal) return refusal
      throw error
    }
    const lines = splitLines(source)
    const detected = sectionsByPattern(lines, PREAMBLE_CHAPTER_PATTERN)
    if (detected.sections.length === 0) {
      return toolFailed(
        L({
          ko: '(오류: PREAMBLE / CHAPTER ONE 형식의 장 경계를 찾지 못했습니다.)',
          en: '(Error: No chapter boundaries in PREAMBLE / CHAPTER ONE format were found.)',
        }),
      )
    }
    const sections = detected.sections.map((section) => ({ ...section }))
    if (
      sections.length >= 2 &&
      sections[0].preamble &&
      /^PREAMBLE$/i.test(sections[1].title)
    ) {
      sections[1].startLine = 1
      sections.shift()
    }

    const usedPaths = new Set<string>()
    const changes: ProposedChange[] = []
    for (const [index, section] of sections.entries()) {
      const rawTitle = section.preamble ? 'PREAMBLE' : section.title
      const safeTitle = rawTitle
        .replace(/[\\/:*?"<>|#[\]^]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120)
      const baseTitle = safeTitle || `PART ${index + 1}`
      let suffix = 1
      let targetPath = normalizePath(`${outputFolder}/${baseTitle}.md`)
      while (usedPaths.has(targetPath.toLowerCase())) {
        suffix += 1
        targetPath = normalizePath(
          `${outputFolder}/${baseTitle} (${suffix}).md`,
        )
      }
      usedPaths.add(targetPath.toLowerCase())
      const content = lines
        .slice(section.startLine - 1, section.endLine)
        .join('\n')
      const proposed = await this.deps.localTools.execute('write_file', {
        path: targetPath,
        content,
      })
      if (proposed.kind === 'error')
        return toolFailed(
          L({
            ko: `(오류: ${proposed.message})`,
            en: `(Error: ${proposed.message})`,
          }),
        )
      if (proposed.kind !== 'change') {
        return toolFailed(
          L({
            ko: `(오류: ${targetPath} 분할 변경안을 만들지 못했습니다.)`,
            en: `(Error: Could not create a split change proposal for ${targetPath}.)`,
          }),
        )
      }
      proposed.change.tool = 'split_file_by_chapters'
      changes.push(proposed.change)
    }

    const outcomes = await this.deps.stepExecutor.processBatch(runId, changes)
    for (const outcome of outcomes) {
      await this.deps.recordToolOutcome(runId, outcome)
    }
    const applied = outcomes.filter((outcome) => outcome.status === 'applied')
    if (applied.length === outcomes.length) {
      return toolSucceeded(
        L({
          ko: `적용됨: ${outputFolder} — ${applied.length}개 파일로 전체 장 분할 완료 (L1-L${lines.length} 전체 포함)`,
          en: `Applied: ${outputFolder} — Split all chapters into ${applied.length} files (full coverage of L1-L${lines.length})`,
        }),
        { mutation: 'applied' },
      )
    }
    if (applied.length > 0) {
      return toolSucceeded(
        L({
          ko: `부분 적용됨: ${outputFolder} — ${applied.length}/${outcomes.length}개 파일 적용`,
          en: `Partially applied: ${outputFolder} — ${applied.length}/${outcomes.length} files applied`,
        }),
        { mutation: 'partial' },
      )
    }
    return toolRejected(
      L({
        ko: `거부됨: ${outputFolder} — 장 분할 파일이 적용되지 않았습니다.`,
        en: `Rejected: ${outputFolder} — Chapter split files were not applied.`,
      }),
    )
  }

  async transformFile(input: {
    runId: string
    path: string
    instruction: string
    signal?: AbortSignal
    onStatusChange?: (status: AgentLoopStatus) => void
    confirmLargeOperation?: LargeOperationConfirm
  }): Promise<
    | { kind: 'success'; path: string; text: string; chunkCount: number }
    | { kind: 'error' | 'cancelled'; message: string }
  > {
    const file = this.deps.app.vault.getFileByPath(input.path)
    if (!file || !('extension' in file) || file.extension !== 'md') {
      return {
        kind: 'error',
        message: `Markdown file not found: ${input.path}`,
      }
    }
    // An AI-private refusal thrown here has no slot in this result type; the
    // tool-call boundary (refusingAiPrivateRead) turns it into the refusal.
    const source = (await readLargeSource(this.deps.app, file)).text
    const settings = this.deps.getSettings()
    const { model } = getChatModelClient({
      modelId: resolveChatModelId({ settings }).modelId,
      settings,
    })
    const contextWindow = resolveContextWindow(model)
    const outputBudget = computeOutputBudget(
      contextWindow,
      settings.verbex.context.reservedOutputTokens,
    )
    const inputBudget = computeInputBudget(contextWindow, outputBudget)
    const approved = await this.approveOperation(input.confirmLargeOperation, {
      path: input.path,
      operation: 'transform',
      contentTokens: await tokenCount(source),
      taskTokens: await tokenCount(input.instruction),
      inputBudget,
    })
    if (!approved) {
      return {
        kind: 'cancelled',
        message: L({
          ko: `"${input.path}" 전체 변환을 사용자가 취소했습니다.`,
          en: `The user cancelled the whole-file transformation of "${input.path}".`,
        }),
      }
    }
    const transformKey = `large_transform_${(await sha256Hex(input.path)).slice(0, 12)}`
    const transformMetadata = {
      path: input.path,
      mtime: file.stat.mtime,
      contentHash: await sha256Hex(source),
      instructionHash: await sha256Hex(input.instruction),
      model: model.id,
      inputBudget,
      outputBudget,
    }
    const baseRun = await this.deps.loadRunForUpdate(
      input.runId,
      `Large transform: ${input.path}`,
    )
    let resumeChunks: string[] = []
    try {
      const savedMetadata = JSON.parse(
        RunArtifactStore.getArtifact(baseRun, `${transformKey}_metadata`) ??
          'null',
      ) as typeof transformMetadata | null
      if (
        savedMetadata &&
        JSON.stringify(savedMetadata) === JSON.stringify(transformMetadata)
      ) {
        const savedChunks = JSON.parse(
          RunArtifactStore.getArtifact(baseRun, `${transformKey}_chunks`) ??
            '[]',
        ) as unknown
        if (Array.isArray(savedChunks)) {
          resumeChunks = savedChunks.filter(
            (chunk): chunk is string => typeof chunk === 'string',
          )
        }
      }
    } catch {
      resumeChunks = []
    }
    const completedChunks = [...resumeChunks]
    const runStep = (messages: RequestMessage[]) =>
      gatedChatStep({
        settings,
        requiredBlocks: messages,
        maxTokens: outputBudget,
        inputBudget,
        options: input.signal ? { signal: input.signal } : undefined,
      }).then((step) => step.text)
    try {
      const transformed = settings.verbex.context.batchTransformEngine
        ? await runGenericTransformJob({
            source: { path: input.path, content: source },
            instruction: input.instruction,
            profile: /^#{1,6}\s/m.test(source) ? 'headings' : 'token_chunks',
            inputBudget,
            outputBudget,
            modelId: model.id,
            configHash: await sha256Hex(
              JSON.stringify({ inputBudget, outputBudget }),
            ),
            contractHash: 'default-transform-v1',
            engineVersion: '1',
            store: new JournalJobStore(
              this.deps.app.vault.adapter as unknown as JobStoreFileAdapter,
            ),
            runStep,
          }).then((result) => ({
            text: result.text,
            chunkCount: result.atomCount,
          }))
        : await transformLargeDocument({
            document: source,
            instruction: input.instruction,
            inputTokenBudget: inputBudget,
            outputTokenBudget: outputBudget,
            documentLabel: input.path,
            resumeChunks,
            runStep,
            onProgress: ({ index, total }) =>
              input.onStatusChange?.({
                type: 'large_file_progress',
                operation: 'transform',
                phase: 'transforming',
                path: input.path,
                index,
                total,
              }),
            onChunkComplete: async ({ index, text }) => {
              completedChunks[index - 1] = text
              const chunks = JSON.stringify(completedChunks)
              await this.deps.updateRunArtifacts(
                input.runId,
                (base) => {
                  let updated = RunArtifactStore.setArtifact(
                    base,
                    `${transformKey}_metadata`,
                    JSON.stringify(transformMetadata),
                  )
                  updated = RunArtifactStore.setArtifact(
                    updated,
                    `${transformKey}_chunks`,
                    chunks,
                  )
                  return { ...updated, status: 'in_progress' }
                },
                `Large transform: ${input.path}`,
              )
            },
          })
      return {
        kind: 'success',
        path: input.path,
        text: transformed.text,
        chunkCount: transformed.chunkCount,
      }
    } catch (error) {
      return {
        kind: 'error',
        message: L({
          ko: `대용량 문서 변환 실패 — ${error instanceof Error ? error.message : String(error)}`,
          en: `Large document transformation failed — ${error instanceof Error ? error.message : String(error)}`,
        }),
      }
    }
  }

  async approveOperation(
    confirm: LargeOperationConfirm | undefined,
    info: {
      path: string
      operation: 'analysis' | 'transform'
      contentTokens: number
      taskTokens: number
      inputBudget: number
    },
  ): Promise<boolean> {
    const threshold =
      this.deps.getSettings().verbex.context.largeFileConfirmChunkThreshold
    if (!confirm || threshold <= 0) return true
    const chunkInputBudget = Math.max(
      256,
      Math.floor(
        info.inputBudget *
          this.deps.getSettings().verbex.context.mapReduceChunkRatio,
      ),
    )
    const estimatedChunks = estimateMapChunkCount(
      info.contentTokens,
      chunkInputBudget,
      info.taskTokens,
    )
    if (estimatedChunks <= threshold) return true
    return confirm({
      path: info.path,
      operation: info.operation,
      estimatedChunks,
    })
  }

  async prepareAttachments(
    request: string,
    files: TFile[],
    inputBudget: number,
    signal?: AbortSignal,
    onToolResult?: (call: ToolCallRequest, result: string) => void,
    onStatusChange?: (status: AgentLoopStatus) => void,
    runId?: string,
    source: AttachmentDigest['source'] = 'attachment',
    confirmLargeOperation?: LargeOperationConfirm,
    analysisGuidance?: string | null,
    evidenceOnly = false,
    listOnlyToolName?: string,
  ): Promise<PreparedAttachments> {
    if (files.length === 0) {
      return { smallFiles: files, digests: [], listOnlyFiles: [] }
    }
    // A self-contained server tool needs only stable vault paths, regardless of
    // file size. Returning small files as ordinary context here used to drop the
    // active note entirely at the caller (which only consumes the list-only
    // result for this path), leaving build_treaty_wiki without source_path and
    // preventing the wiki-target confirmation modal from ever being reached.
    if (listOnlyToolName) {
      return { smallFiles: [], digests: [], listOnlyFiles: files }
    }
    if (!this.deps.getSettings().verbex.context.autoSplitLargeInput) {
      return { smallFiles: files, digests: [], listOnlyFiles: [] }
    }
    // Split / extract / whole-file transform tasks must NOT be turned into an
    // analysis digest — the agent needs the real file to run extract_to_file /
    // transform_large_file. Leave the file untouched so the outline + bounded
    // read tools stay usable. (Analysis/summary tasks still digest below.)
    const scope = decideRequestScope({ request })
    const isVerbatim =
      scope.operation === 'transform' ||
      (scope.operation === 'extract' && isStructuralExtractionIntent(request))
    if (!listOnlyToolName && isVerbatim) {
      return { smallFiles: files, digests: [], listOnlyFiles: [] }
    }
    const analysisTask = buildLargeDocumentAnalysisTask(
      request,
      analysisGuidance,
      evidenceOnly,
    )
    const taskTokens = await tokenCount(analysisTask)

    // A file is "large" either when it would crowd out the model input window or
    // when it would swamp ContextBuilder's automatic grounding budget. The
    // second threshold catches medium-sized attachments on large-context models:
    // they fit the model, but not the curated context pack.
    const effectiveMaxContextTokens = effectiveContextBudget(
      this.deps.getSettings(),
      inputBudget,
    )

    const perFileBudget = Math.floor(inputBudget * 0.7)
    const contextDigestBudget = Math.floor(
      effectiveMaxContextTokens *
        this.deps.getSettings().verbex.context
          .attachmentDigestTokenThresholdRatio,
    )
    // Whole-current-note tasks must not fall into the gap between the smaller
    // current-note grounding budget and the general attachment digest budget.
    // In that gap ContextBuilder can only provide an outline/excerpt, while the
    // file is considered too small for map-reduce, leaving the agent without
    // the full source it was explicitly asked to review. Align the threshold
    // with the budget that decides whether the current note can be included in
    // full. `snippet` remains an explicit opt-out from automatic full grounding.
    const sourceDigestBudget =
      source === 'current_note' &&
      this.deps.getSettings().verbex.context.currentNoteMode !== 'snippet'
        ? Math.min(
            contextDigestBudget,
            this.deps.getSettings().verbex.context.currentNoteTokenBudget,
          )
        : contextDigestBudget
    const digestThreshold = Math.max(
      256,
      Math.min(perFileBudget, sourceDigestBudget),
    )
    const digests: AttachmentDigest[] = []
    const listOnlyFiles: TFile[] = []
    // Files that individually fit the budget. Carried with content + a
    // conservative token estimate so the aggregate pass below can decide whether
    // their *combined* size still overflows, without re-reading or re-tokenizing.
    const kept: {
      file: TFile
      content: string
      tokens: number
      origin?: LargeSource
    }[] = []
    // Document projections answer partial requests through bounded excerpts
    // and read tools; only whole-coverage requests may digest them.
    const excerptOnlyFiles: TFile[] = []

    for (const file of files) {
      let content: string
      let origin: LargeSource
      try {
        origin = await readLargeSource(this.deps.app, file)
        content = origin.text
      } catch {
        // Unreadable here means ContextBuilder will skip it too; keep old path.
        // An unavailable projection likewise keeps its path/state excerpt.
        kept.push({ file, content: '', tokens: 0 })
        continue
      }
      if (origin.projection && scope.coverage !== 'whole') {
        excerptOnlyFiles.push(file)
        continue
      }

      // Cheap char-ratio pre-filter so ordinary notes are never tokenized.
      const roughTokens = Math.ceil(content.length / 3.5)
      const exactTokens =
        roughTokens <= digestThreshold ? null : await tokenCount(content)
      if (exactTokens === null || exactTokens <= digestThreshold) {
        kept.push({ file, content, tokens: estimateTokens(content), origin })
        continue
      }

      if (listOnlyToolName) {
        listOnlyFiles.push(file)
        continue
      }

      if (runId) {
        const activeModelId = resolveChatModelId({
          settings: this.deps.getSettings(),
        }).modelId
        const cached = await this.recoverLargeFileDigest(
          runId,
          file,
          content,
          analysisTask,
          activeModelId,
          source,
          onToolResult,
          origin,
        )
        if (cached) {
          digests.push(cached)
          continue
        }
      }

      // §6.6: a predicted-expensive analysis is confirmed before running; a
      // decline keeps the file verbatim so the normal snippet / bounded-read
      // path handles it instead of silently spending on a big map-reduce.
      const approved = await this.approveOperation(confirmLargeOperation, {
        path: file.path,
        operation: 'analysis',
        contentTokens: exactTokens,
        taskTokens,
        inputBudget,
      })
      if (!approved) {
        kept.push({ file, content, tokens: estimateTokens(content), origin })
        continue
      }

      digests.push(
        await this.digestAttachment(
          file,
          content,
          request,
          analysisTask,
          inputBudget,
          signal,
          onToolResult,
          onStatusChange,
          runId,
          source,
          evidenceOnly,
          origin,
        ),
      )
    }

    // Aggregate pass (요구사항 2·3 보강): each kept file fit on its own, but their
    // combined size can still crowd the assembly budget and push the
    // lower-priority attachments out entirely. Compress the largest ones until the
    // verbatim remainder fits, so every attachment contributes — in full or as a
    // digest — instead of some being silently budget-dropped.
    const { digest: toDigest, keep } = selectAttachmentsToDigest(
      kept.map((entry) => ({ item: entry, tokens: entry.tokens })),
      contextDigestBudget,
    )
    const smallFiles = [...keep.map((entry) => entry.file), ...excerptOnlyFiles]
    for (const entry of toDigest) {
      if (listOnlyToolName) {
        listOnlyFiles.push(entry.file)
        continue
      }
      if (runId) {
        const activeModelId = resolveChatModelId({
          settings: this.deps.getSettings(),
        }).modelId
        const cached = await this.recoverLargeFileDigest(
          runId,
          entry.file,
          entry.content,
          analysisTask,
          activeModelId,
          source,
          onToolResult,
          entry.origin,
        )
        if (cached) {
          digests.push(cached)
          continue
        }
      }
      const approved = await this.approveOperation(confirmLargeOperation, {
        path: entry.file.path,
        operation: 'analysis',
        contentTokens: entry.tokens,
        taskTokens,
        inputBudget,
      })
      if (!approved) {
        smallFiles.push(entry.file)
        continue
      }
      digests.push(
        await this.digestAttachment(
          entry.file,
          entry.content,
          request,
          analysisTask,
          inputBudget,
          signal,
          onToolResult,
          onStatusChange,
          runId,
          source,
          evidenceOnly,
          entry.origin,
        ),
      )
    }

    return { smallFiles, digests, listOnlyFiles }
  }

  /**
   * Run one map-reduce / verify / synthesis step, recovering from output-length
   * truncation instead of silently propagating a half-finished partial.
   *
   * When the model stops with `finish_reason: 'length'`, the cut-off draft is
   * fed back with a "continue from where you left off" turn and the segments are
   * concatenated, up to {@link MAP_REDUCE_MAX_CONTINUATIONS} times. `truncated`
   * is true only when the output was *still* incomplete after the final attempt,
   * so the caller can warn that this run's coverage may be partial. Thinking is
   * disabled here so it can't consume the bounded output budget.
   */
  private async runMapReduceStep(input: {
    messages: RequestMessage[]
    inputBudget: number
    maxTokens: number
    timeoutMs: number
    runId?: string
    signal?: AbortSignal
  }): Promise<{ text: string; truncated: boolean }> {
    let messages = input.messages
    let combined = ''
    let truncated = false
    for (let attempt = 0; attempt <= MAP_REDUCE_MAX_CONTINUATIONS; attempt++) {
      const step = await gatedChatStep({
        settings: this.deps.getSettings(),
        requiredBlocks: messages,
        inputBudget: input.inputBudget,
        // mapReduceDocument/transform chunking already reserves framing room;
        // do not apply the generic 20% margin a second time here.
        safetyMarginRatio: 0,
        reasoningEffort: 'none',
        maxTokens: input.maxTokens,
        options: {
          ...(input.signal ? { signal: input.signal } : {}),
          timeoutMs: input.timeoutMs,
        },
      })
      combined += step.text
      if (step.finishReason !== 'length') {
        // A blank continuation cannot complete a previously cut-off answer.
        truncated = attempt > 0 && !step.text.trim()
        break
      }
      truncated = true
      if (attempt === MAP_REDUCE_MAX_CONTINUATIONS) break
      messages = [
        ...messages,
        { role: 'assistant', content: step.text },
        {
          role: 'user',
          content: L({
            ko: '앞 답변이 최대 길이에 걸려 중간에 끊겼습니다. 이미 작성한 내용을 반복하지 말고, 끊긴 지점부터 이어서만 계속 작성하세요.',
            en: 'The previous answer reached the maximum length and was cut off. Continue only from where it stopped, without repeating content already written.',
          }),
        },
      ]
    }
    return { text: combined, truncated }
  }

  /**
   * Process one oversized (or aggregate-selected) attachment with a full
   * map-reduce pass and return its integrated digest. Extracted so both the
   * per-file threshold path and the aggregate-overflow path share one
   * implementation.
   */
  private async digestAttachment(
    file: TFile,
    content: string,
    request: string,
    analysisTask: string,
    inputBudget: number,
    signal?: AbortSignal,
    onToolResult?: (call: ToolCallRequest, result: string) => void,
    onStatusChange?: (status: AgentLoopStatus) => void,
    runId?: string,
    source: AttachmentDigest['source'] = 'attachment',
    evidenceOnly = false,
    origin?: LargeSource,
  ): Promise<AttachmentDigest> {
    const projection = origin?.projection
    const notify = (message: string) =>
      onToolResult?.(
        {
          id: 'large_file_mapreduce',
          name: 'large_file_mapreduce',
          arguments: JSON.stringify({ path: file.path }),
        },
        message,
      )

    // Each map/reduce LLM call processes up to this many input tokens. Filling
    // less than the full window (chunkRatio < 1) makes each call faster and
    // less likely to hit the request timeout, at the cost of more chunks.
    const chunkInputBudget = Math.max(
      256,
      Math.floor(
        inputBudget *
          this.deps.getSettings().verbex.context.mapReduceChunkRatio,
      ),
    )
    const stepTimeoutMs =
      this.deps.getSettings().verbex.context.mapReduceTimeoutMs
    const mapReduceOutputBudget = computeMapReduceOutputBudget(
      inputBudget,
      this.deps.getSettings().verbex.context.mapReduceMaxOutputTokens,
    )
    // Set by any step (map/reduce/verify/synthesis) whose output was still cut
    // off by the cap after continuation attempts, so we can warn the user that
    // coverage may be partial instead of silently shipping a truncated digest.
    // A projection cut short at extraction never covers the whole original.
    let truncatedAnyStep = projection?.truncated === true
    // Cross-dependent agreement review keeps the established verification
    // pipeline until the quality gate is measured. Other analysis tasks may opt
    // into the JobStore-backed adapter behind the default-off M5b switch.
    const useBatchAnalysis =
      this.deps.getSettings().verbex.context.batchAnalysisEngine &&
      !evidenceOnly &&
      decideRequestScope({ request }).coverage !== 'whole'
    const runBoundedStep = async (messages: RequestMessage[]) => {
      const step = await this.runMapReduceStep({
        messages,
        inputBudget,
        maxTokens: mapReduceOutputBudget,
        timeoutMs: stepTimeoutMs,
        runId,
        signal,
      })
      if (step.truncated) truncatedAnyStep = true
      return step
    }
    const runTextStep = async (messages: RequestMessage[]) =>
      (await runBoundedStep(messages)).text
    const result = useBatchAnalysis
      ? await runGenericAnalysisJob({
          sources: [{ path: file.path, content }],
          task: analysisTask,
          profile: /^#{1,6}\s/m.test(content) ? 'headings' : 'token_chunks',
          inputBudget: chunkInputBudget,
          modelId: resolveChatModelId({ settings: this.deps.getSettings() })
            .modelId,
          configHash: await sha256Hex(
            JSON.stringify({ chunkInputBudget, mapReduceOutputBudget }),
          ),
          contractHash: 'default-analysis-v1',
          engineVersion: '1',
          store: new JournalJobStore(
            this.deps.app.vault.adapter as unknown as JobStoreFileAdapter,
          ),
          runMapStep: runTextStep,
          runReduceStep: runTextStep,
        }).then((generic) => ({
          finalText: generic.text,
          chunkCount: generic.atomCount,
          mapOutputs: [] as string[],
          reduceRounds: 0,
          evidenceRecords: generic.evidenceRecords,
          evidenceSummary: generic.evidenceSummary,
        }))
      : await mapReduceDocument({
          document: content,
          task: analysisTask,
          inputTokenBudget: chunkInputBudget,
          documentLabel: projection
            ? `${file.path} (disk projection)`
            : file.path,
          mode: evidenceOnly ? 'evidence' : 'analysis',
          signal,
          countTokens: tokenCount,
          runStep: runBoundedStep,
          onProgress: ({ phase, index, total }) => {
            onStatusChange?.({
              type: 'large_file_progress',
              operation: 'analysis',
              phase: phase === 'map' ? 'mapping' : 'reducing',
              path: file.path,
              index,
              total,
            })
          },
        })
    if ('reductionIncomplete' in result && result.reductionIncomplete)
      truncatedAnyStep = true
    let finalText = result.finalText
    let sequentialVerification = false
    if (
      !evidenceOnly &&
      result.chunkCount > 1 &&
      decideRequestScope({ request }).coverage === 'whole'
    ) {
      sequentialVerification = true
      onStatusChange?.({
        type: 'large_file_progress',
        operation: 'analysis',
        phase: 'verifying',
        path: file.path,
        index: 1,
        total: 2,
      })
      const evidence = result.mapOutputs
        .map((output, index) =>
          L({
            ko: `## 구간 ${index + 1}\n${output}`,
            en: `## Section ${index + 1}
${output}`,
          }),
        )
        .join('\n\n')
      const verification = await mapReduceDocument({
        document: evidence,
        task: L({
          ko: `다음은 원문 구간별 검토 결과(근거)입니다. 아래의 적용할 작업 지침에 따라 작성된 통합 초안을 구간별 결과에 대조하여, 구간별 결과에는 있으나 초안에서 누락된 쟁점, 조항 간 모순, 잘못 합쳐진 결론, 구간별 결과로 뒷받침되지 않는(근거 위치가 불명확한) 초안의 주장만 지적하세요. 각 지적에는 근거가 되는 구간 번호와 조항/섹션 위치를 명시하세요. 구간별 결과에 없는 새로운 내용·평가·정당화·권고를 지어내지 말고, 초안을 "더 좋게" 만들기 위한 서술 추가를 지시하지 마세요(당신의 임무는 정확성 교정이지 개선이 아닙니다). 선택 지침의 현재 단계를 넘어서는 내용을 요구하지 마세요. 교정할 사항이 없으면 "교정 필요 없음"이라고만 답하세요.\n\n# 적용할 작업 지침\n${analysisTask}\n\n# 통합 초안\n${finalText}`,
          en: `The following are review results (evidence) for individual source sections. Compare the integrated draft, written under the applicable task guidance below, against these section results. Point out only issues present in the section results but omitted from the draft, contradictions between articles, incorrectly merged conclusions, and draft claims unsupported by section results (with unclear evidence locations). For each correction, specify the supporting section number and article/section location. Do not invent new content, assessments, justifications, or recommendations absent from the section results, and do not request extra prose to make the draft "better" (your task is accuracy correction, not improvement). Do not request content beyond the current stage of the selected guidance. If no corrections are needed, reply only "No corrections needed".

# Applicable task guidance
${analysisTask}

# Integrated draft
${finalText}`,
        }),
        inputTokenBudget: chunkInputBudget,
        documentLabel: L({
          ko: `${file.path} 교차검증`,
          en: `${file.path} cross-verification`,
        }),
        signal,
        countTokens: tokenCount,
        runStep: async (messages) => {
          const step = await this.runMapReduceStep({
            messages,
            inputBudget,
            maxTokens: mapReduceOutputBudget,
            timeoutMs: stepTimeoutMs,
            runId,
            signal,
          })
          if (step.truncated) truncatedAnyStep = true
          return step.text
        },
      })
      if (
        verification.reductionIncomplete ||
        verification.evidenceSummary.reprocessRequired > 0 ||
        !verification.finalText.trim()
      )
        truncatedAnyStep = true
      onStatusChange?.({
        type: 'large_file_progress',
        operation: 'analysis',
        phase: 'verifying',
        path: file.path,
        index: 2,
        total: 2,
      })
      const finalStep = await this.runMapReduceStep({
        inputBudget,
        maxTokens: mapReduceOutputBudget,
        timeoutMs: stepTimeoutMs,
        runId,
        signal,
        messages: [
          {
            role: 'system',
            content: L({
              ko: '대용량 문서의 통합 초안과 교차검증 결과를 반영해 현재 요청 단계의 최종 결과를 작성하세요. 적용할 Skill/Workflow 지침의 목적과 출력 형식을 지키고, 현재 단계를 넘어 다음 단계나 최종 보고서로 건너뛰지 마세요. 교정 근거가 없는 내용을 새로 만들지 말고, 조항·섹션 위치를 보존하세요. 교차검증 결과의 지침이라도 통합 초안이나 원문에 근거가 없으면 반영하지 마세요.',
              en: 'Write the final result for the currently requested stage using the integrated draft and cross-verification results for the large document. Follow the purpose and output format of the applicable Skill/Workflow guidance, and do not skip beyond the current stage to the next stage or final report. Do not invent content without correction evidence, and preserve article/section locations. Even instructions in the cross-verification results must not be incorporated unless supported by the integrated draft or source.',
            }),
          },
          {
            role: 'user',
            content: L({
              ko: `# 적용할 작업 지침\n${analysisTask}\n\n# 통합 초안\n${finalText}\n\n# 교차검증 결과\n${verification.finalText}`,
              en: `# Applicable task guidance
${analysisTask}

# Integrated draft
${finalText}

# Cross-verification results
${verification.finalText}`,
            }),
          },
        ],
      })
      if (finalStep.truncated) truncatedAnyStep = true
      finalText = finalStep.text
    }
    notify(
      L({
        ko: `"${file.path}" 분할 처리 완료: ${result.chunkCount}개 조각을 분석·통합했습니다.`,
        en: `Finished split processing of "${file.path}": analyzed and integrated ${result.chunkCount} chunks.`,
      }),
    )
    if (projection?.truncated) {
      notify(
        L({
          ko: `⚠️ "${file.path}"의 디스크 투영은 추출 단계에서 잘려 원본 일부만 담고 있습니다. 이 분석은 원본 전체 coverage가 아닙니다.`,
          en: `⚠️ The disk projection of "${file.path}" was truncated during extraction and contains only part of the source. This analysis does not cover the entire source.`,
        }),
      )
    } else if (truncatedAnyStep) {
      notify(
        L({
          ko: `⚠️ "${file.path}" 처리 중 일부 단계의 출력이 누락되었거나 잘렸을 수 있습니다. 결과가 원본 전체를 포함한다고 가정하지 마세요.`,
          en: `⚠️ Some processing steps for "${file.path}" may have missing or truncated output. Do not assume the result includes the entire source.`,
        }),
      )
    }
    if (runId) {
      const activeModelId = resolveChatModelId({
        settings: this.deps.getSettings(),
      }).modelId
      await this.persistLargeFileArtifact(runId, {
        file,
        request,
        analysisTask,
        modelId: activeModelId,
        source,
        chunkCount: result.chunkCount,
        sequentialVerification,
        finalText,
        content,
        truncated: truncatedAnyStep,
        ...('reductionIncomplete' in result
          ? { coverageProtocol: 2 as const }
          : {}),
        evidenceRecords: result.evidenceRecords,
        origin,
      })
    }
    return {
      path: file.path,
      text: finalText,
      chunkCount: result.chunkCount,
      source,
      sequentialVerification,
      truncated: truncatedAnyStep,
      ...('reductionIncomplete' in result
        ? { coverageProtocol: 2 as const }
        : {}),
      evidenceRecords: result.evidenceRecords,
      evidenceSummary: result.evidenceSummary,
      ...(projection ? { projection } : {}),
    }
  }

  private async recoverLargeFileDigest(
    runId: string,
    file: TFile,
    content: string,
    analysisTask: string,
    modelId: string,
    source: AttachmentDigest['source'],
    onToolResult?: (call: ToolCallRequest, result: string) => void,
    origin?: LargeSource,
  ): Promise<AttachmentDigest | null> {
    try {
      const run = await this.deps.loadRunForUpdate(
        runId,
        `Large file check: ${file.path}`,
      )
      const key = `large_file_${(await sha256Hex(file.path)).slice(0, 12)}`
      const digest = RunArtifactStore.getLargeDigest(run, key)
      if (!digest || !digest.metadata) return null

      const metadata = digest.metadata as {
        path: string
        mtime: number
        contentHash: string
        taskHash: string
        modelId?: string
        locale?: string
        source: AttachmentDigest['source']
        chunkCount: number
        sequentialVerification: boolean
        truncated?: boolean
        coverageProtocol?: number
        evidenceRecords?: EvidenceRecord[]
        sourceIdentity?: string
        projection?: AttachmentDigest['projection']
      }
      const digestText = digest.text

      const contentHash = await sha256Hex(content)
      const taskHash = await sha256Hex(analysisTask)

      // Legacy Markdown entries predate sourceIdentity; their identity is the
      // content hash. Projections must match revision + extractor exactly.
      if (
        metadata.path === file.path &&
        metadata.mtime === file.stat.mtime &&
        metadata.contentHash === contentHash &&
        (metadata.sourceIdentity ?? metadata.contentHash) ===
          (origin?.identity ?? contentHash) &&
        !metadata.projection === !origin?.projection &&
        metadata.taskHash === taskHash &&
        metadata.modelId === modelId &&
        (metadata.locale ?? 'ko') === getModelLocale() &&
        metadata.source === source
      ) {
        onToolResult?.(
          {
            id: 'large_file_mapreduce',
            name: 'large_file_mapreduce',
            arguments: JSON.stringify({ path: file.path }),
          },
          L({
            ko: `📄 캐시된 대용량 파일 분석을 재사용했습니다: ${file.path}`,
            en: `📄 Reused cached large-file analysis: ${file.path}`,
          }),
        )
        return {
          path: file.path,
          text: digestText,
          chunkCount: metadata.chunkCount ?? 1,
          source: metadata.source ?? 'attachment',
          sequentialVerification: metadata.sequentialVerification ?? false,
          truncated: metadata.truncated ?? false,
          ...(metadata.coverageProtocol === 2
            ? { coverageProtocol: 2 as const }
            : {}),
          ...(parseEvidenceRecords(metadata.evidenceRecords).length > 0
            ? {
                evidenceRecords: parseEvidenceRecords(metadata.evidenceRecords),
                evidenceSummary: reduceEvidenceRecords({
                  records: parseEvidenceRecords(metadata.evidenceRecords),
                }).summary,
              }
            : {}),
          ...(origin?.projection ? { projection: origin.projection } : {}),
        }
      }
    } catch (e) {
      console.warn('Failed to recover large file digest:', e)
    }
    return null
  }

  private async persistLargeFileArtifact(
    runId: string,
    input: {
      file: TFile
      request: string
      analysisTask: string
      modelId: string
      source: AttachmentDigest['source']
      chunkCount: number
      sequentialVerification: boolean
      finalText: string
      content: string
      truncated: boolean
      coverageProtocol?: 2
      evidenceRecords: EvidenceRecord[]
      origin?: LargeSource
    },
  ): Promise<void> {
    const key = `large_file_${(await sha256Hex(input.file.path)).slice(0, 12)}`
    const digestMetadata = {
      path: input.file.path,
      mtime: input.file.stat.mtime,
      contentHash: await sha256Hex(input.content),
      taskHash: await sha256Hex(input.analysisTask),
      modelId: input.modelId,
      locale: getModelLocale(),
      source: input.source,
      chunkCount: input.chunkCount,
      sequentialVerification: input.sequentialVerification,
      truncated: input.truncated,
      ...(input.coverageProtocol === 2 ? { coverageProtocol: 2 } : {}),
      evidenceRecords: input.evidenceRecords,
      ...(input.origin
        ? {
            sourceIdentity: input.origin.identity,
            ...(input.origin.projection
              ? { projection: input.origin.projection }
              : {}),
          }
        : {}),
    }
    await this.deps.updateRunArtifacts(
      runId,
      (base) => ({
        ...RunArtifactStore.setLargeDigest(base, key, {
          text: input.finalText,
          metadata: digestMetadata,
        }),
        status: 'in_progress',
      }),
      `Large file: ${input.file.path}`,
    )
  }
}
