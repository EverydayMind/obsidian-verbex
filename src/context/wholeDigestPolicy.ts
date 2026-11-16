import type { ContextPackerResult } from '../core/batch/contextPacker'
import type { CoverageDecision } from '../core/routing/scopeDecision'
import type { AttachmentDigest } from '../verbex/types'

import type { ContextPolicy } from './contextPolicy'
import * as requestIntent from './requestIntent'

/** A task-specific, single-source digest can satisfy the initial read directive.
 * Empty output, incomplete processing, or omitted packets fail closed. */
export function requiresContextToolCall(
  policy: ContextPolicy,
  input: {
    request: string
    mentionables?: unknown[]
    activeSkills?: unknown[]
    skillInstructions?: string | null
    companionScope?: unknown
    browserContext?: unknown
    pinnedConnectorTools?: string[]
    priorDocumentPaths?: string[]
  },
  plan: {
    isFirstTurn: boolean
    activeWorkflow: unknown
    effectiveCurrentFile: { path: string } | null
    scopeDecision: Pick<CoverageDecision, 'coverage' | 'operation'>
  },
  digests: AttachmentDigest[],
  packed: ContextPackerResult,
): boolean {
  if (!policy.requireToolCall) return false
  if (
    !plan.isFirstTurn ||
    plan.activeWorkflow ||
    input.mentionables?.length ||
    input.activeSkills?.length ||
    input.skillInstructions ||
    input.companionScope ||
    input.browserContext ||
    input.pinnedConnectorTools?.length ||
    input.priorDocumentPaths?.length
  )
    return true
  if (
    plan.scopeDecision.coverage !== 'whole' ||
    plan.scopeDecision.operation !== 'analysis'
  )
    return true
  // Do not infer that a comparison, search, write, or tool request is satisfied
  // by a digest of only the current document.
  if (
    /\b(?:other|multiple|several)\s+(?:documents?|notes?|files?)\b|\b(?:cross[- ]check|validate|look into|create|change|edit|revise|email|transmit|dispatch|download|publish|rewrite|convert)\b/i.test(
      input.request,
    ) ||
    !requestIntent.summary(input.request, /요약|summari[sz]e|summary/i) ||
    requestIntent.extraSummaryWork(
      input.request,
      /다른\s*(?:문서|노트|파일)|여러\s*(?:문서|노트|파일)|비교|대조|검색|찾아|찾고|조사|검증|저장|내보내|파일로|노트로|도구|삭제|지워|발송|전송|보내|업로드|수정|변경|번역|요약(?:하고|한\s*뒤|한\s*후)|(?:파일|노트).{0,20}(?:작성|생성)|compare|comparison|search|find|investigate|verify|save|export|delete|remove|send|upload|modify|translate|\b(?:and|then)\b|write\s+to|write.{0,20}(?:file|note)|tool/i,
    )
  )
    return true
  const digest = digests.length === 1 ? digests[0] : undefined
  const records = digest?.evidenceRecords
  const summary = digest?.evidenceSummary
  if (
    !digest ||
    digest.path !== plan.effectiveCurrentFile?.path ||
    digest.source !== 'current_note' ||
    digest.coverageProtocol !== 2 ||
    digest.truncated ||
    digest.projection?.truncated ||
    !digest.text.trim() ||
    !records ||
    !summary
  )
    return true
  if (
    digest.chunkCount < 1 ||
    records.length !== digest.chunkCount ||
    new Set(records.map((r) => r.unitId)).size !== digest.chunkCount ||
    records.some((r) => r.processingStatus !== 'done') ||
    summary.totalUnits !== digest.chunkCount ||
    summary.coverageSatisfied !== digest.chunkCount ||
    summary.reprocessRequired !== 0 ||
    summary.exceptionClosed !== 0
  )
    return true
  return !packed.blocks.some(
    (block) => block.packetId === 'digests' && block.mode === 'full',
  )
}
