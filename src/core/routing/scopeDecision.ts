import { withoutQuotedFileNames } from '../../context/quotedSpans'
import { L } from '../../i18n/modelText'
import type { BatchContract } from '../batch/contracts'

import {
  ENGLISH_ANALYSIS,
  ENGLISH_EXTRACT,
  ENGLISH_REVIEW,
  ENGLISH_STRUCTURE,
  ENGLISH_TRANSFORM,
  ENGLISH_WHOLE_TRANSFORM,
} from './englishScopeGrammar'

export type RequestCoverage = 'targeted' | 'whole'
export type CoverageConfidence = 'declared' | 'inferred' | 'ambiguous'
export type RequestOperation = 'answer' | 'analysis' | 'transform' | 'extract'

export type CoverageDecision = {
  coverage: RequestCoverage
  confidence: CoverageConfidence
  operation: RequestOperation
  reason: string
}

export type SourceSnapshotEntry = {
  path: string
  contentHash: string
}

export type SourceSnapshot = SourceSnapshotEntry[]

/** Stable across source edits; the source snapshot is deliberately separate. */
export type JobFamilyKey = string

export type JobSpec = {
  familyKey: JobFamilyKey
  sourceSnapshot: SourceSnapshot
  task: string
  contract?: BatchContract
  workflowId?: string
  stepId?: string
  modelId: string
  configHash: string
  engineVersion: string
}

export type ExecutionPlan = {
  executor:
    | 'inline'
    | 'retrieval'
    | 'batch_analysis'
    | 'batch_transform'
    | 'verbatim_tool'
  jobSpec?: JobSpec
}

const EXPLICIT_WHOLE =
  /\b(entire|whole|full|overall|in its entirety|from (?:start|beginning) to (?:finish|end)|(?:each|every) (?:section|item)|all (?:the )?(?:sections?|items?))\b/i
const EXPLICIT_WHOLE_KO = /전체|전문|처음부터\s*끝까지|모든\s*(?:절|항목|섹션)/
const WHOLE_DOCUMENT_ACTION = ENGLISH_ANALYSIS
const WHOLE_DOCUMENT_ACTION_KO = /검토|요약|분석|감사|비평/
const PINPOINT_SCOPE =
  /\b(section|chapter|paragraph|line|page|heading|article|block|table|passage|portion|part)\b(?:\s*[\w.-]*)?/i
const PINPOINT_SCOPE_KO =
  /(?:제?\s*\d+\s*(?:번째\s*)?)(?:절|항|문단|줄|페이지|장|조|블록|표)|(?:특정|일부|해당)\s*(?:절|항|문단|줄|페이지|부분|대목|섹션|장|조|블록|표)/
const LEGACY_PINPOINT_SCOPE_KO =
  /(?:제?\s*\d+\s*)?(?:절|항|문단|줄|페이지|부분|대목|섹션)/
const ANALYSIS_ACTION =
  /검토|감사|심사|요약|분석|비평|review|audit|summari[sz]e|analy[sz]e|critique/i
const EXTRACT_ACTION = /추출|발췌|extract/i
const TRANSFORM_ACTION =
  /번역|재작성|다듬|변환|문체|수정|변경|바꾸|고쳐|교체|translate|rewrite|transform|rephrase/i
const STRUCTURAL_EXTRACTION =
  /(?:분할|쪼개|나누|나눠).{0,48}(?:저장|파일|노트|폴더)|(?:파일|노트|문서).{0,48}(?:분할|쪼개|나누|나눠)|(?:줄|라인|범위|구간).{0,24}추출|추출.{0,40}(?:새\s*(?:파일|노트)|별도\s*(?:파일|노트)|저장|복사)|\bsplit\b.{0,48}\b(?:files?|notes?|chapters?|sections?|save|write)\b|\bextract\b.{0,40}\b(?:lines?|range|to\s+(?:a\s+)?(?:file|note)|save|copy)\b/i
const WHOLE_TRANSFORM =
  /(?:전체|전문|모두|처음부터\s*끝까지).{0,32}(?:번역|재작성|다듬|변환|문체)|(?:번역|재작성|다듬|변환|문체).{0,32}(?:전체|전문|모두|처음부터\s*끝까지)|(?:translate|rewrite|transform|rephrase).{0,48}(?:entire|whole|full)|(?:entire|whole|full).{0,48}(?:translate|rewrite|transform|rephrase)/i
const CROSS_DOCUMENT_REVIEW = /검토|감사|심사|review|audit/i

export function hasWholeDocumentIntent(query: string): boolean {
  query = withoutQuotedFileNames(query)
  const explicitWhole =
    EXPLICIT_WHOLE.test(query) || EXPLICIT_WHOLE_KO.test(query)
  if (explicitWhole) return true
  const wholeAction =
    WHOLE_DOCUMENT_ACTION.test(query) || WHOLE_DOCUMENT_ACTION_KO.test(query)
  const pinpoint =
    PINPOINT_SCOPE.test(query) || LEGACY_PINPOINT_SCOPE_KO.test(query)
  return wholeAction && !pinpoint
}

export function isStructuralExtractionIntent(request: string): boolean {
  return (
    (/\p{Script=Hangul}/u.test(request) &&
      STRUCTURAL_EXTRACTION.test(request)) ||
    ENGLISH_STRUCTURE.test(request)
  )
}

export function isWholeTransformIntent(request: string): boolean {
  return (
    (/\p{Script=Hangul}/u.test(request) && WHOLE_TRANSFORM.test(request)) ||
    ENGLISH_WHOLE_TRANSFORM.test(request)
  )
}

export function isVerbatimOperationIntent(request: string): boolean {
  return (
    isStructuralExtractionIntent(request) || isWholeTransformIntent(request)
  )
}

export function isCrossDocumentReviewIntent(
  request: string,
  activeSkills: { cross_document?: boolean; crossDocument?: boolean }[] = [],
): boolean {
  return (
    ((/\p{Script=Hangul}/u.test(request) &&
      CROSS_DOCUMENT_REVIEW.test(withoutQuotedFileNames(request))) ||
      ENGLISH_REVIEW.test(withoutQuotedFileNames(request))) &&
    activeSkills.some((skill) => skill.cross_document || skill.crossDocument)
  )
}

export function decideRequestScope(input: {
  request: string
  contract?: BatchContract | null
  activeSkills?: { cross_document?: boolean; crossDocument?: boolean }[]
  scopeOverride?: RequestCoverage
  operationOverride?: RequestOperation
}): CoverageDecision {
  const { request, contract, scopeOverride, operationOverride } = input
  if (contract) {
    const operation: RequestOperation =
      contract.output.kind === 'rewrite'
        ? 'transform'
        : contract.output.kind === 'finding' ||
            contract.output.kind === 'notes' ||
            contract.output.kind === 'summary'
          ? 'analysis'
          : 'answer'
    return {
      coverage: 'whole',
      confidence: 'declared',
      operation,
      reason: 'batch contract',
    }
  }

  // Structured companion requests (for example a selected HWPX block) carry
  // an explicit target and operation alongside the natural-language prompt.
  // That metadata is authoritative for routing; the prompt may contain a
  // filename such as "...분석..." that would otherwise look document-wide.
  if (scopeOverride || operationOverride) {
    return {
      coverage: scopeOverride ?? 'targeted',
      confidence: 'declared',
      operation: operationOverride ?? 'answer',
      reason: 'structured companion scope',
    }
  }

  const scopeText = withoutQuotedFileNames(request)
  const korean = /\p{Script=Hangul}/u.test(scopeText)
  const operation: RequestOperation =
    isStructuralExtractionIntent(scopeText) ||
    (korean && EXTRACT_ACTION.test(scopeText)) ||
    ENGLISH_EXTRACT.test(scopeText)
      ? 'extract'
      : (korean && TRANSFORM_ACTION.test(scopeText)) ||
          ENGLISH_TRANSFORM.test(scopeText)
        ? 'transform'
        : (korean && ANALYSIS_ACTION.test(scopeText)) ||
            ENGLISH_ANALYSIS.test(scopeText)
          ? 'analysis'
          : 'answer'
  const explicitWhole =
    EXPLICIT_WHOLE.test(scopeText) || EXPLICIT_WHOLE_KO.test(scopeText)
  const pinpoint =
    PINPOINT_SCOPE.test(scopeText) || PINPOINT_SCOPE_KO.test(scopeText)
  if (explicitWhole && pinpoint) {
    return {
      coverage: 'whole',
      confidence: 'ambiguous',
      operation,
      reason: 'whole-document and local-scope signals conflict',
    }
  }
  if (explicitWhole) {
    return {
      coverage: 'whole',
      confidence: 'inferred',
      operation,
      reason: 'explicit whole-document phrase',
    }
  }
  const documentWideAction =
    WHOLE_DOCUMENT_ACTION.test(scopeText) ||
    WHOLE_DOCUMENT_ACTION_KO.test(scopeText)
  if (documentWideAction && !pinpoint) {
    return {
      coverage: 'whole',
      confidence: 'inferred',
      operation,
      reason: 'document-wide action without a local scope',
    }
  }
  return {
    coverage: 'targeted',
    confidence: 'inferred',
    operation,
    reason: pinpoint ? 'explicit local scope' : 'default targeted scope',
  }
}

export function planRequestExecution(input: {
  decision: CoverageDecision
  sourceTokens: number
  inputBudget: number
  jobSpec?: JobSpec
}): ExecutionPlan {
  const fitsInline = input.sourceTokens <= Math.max(1, input.inputBudget)
  if (input.decision.coverage === 'targeted') {
    return { executor: fitsInline ? 'inline' : 'retrieval' }
  }
  if (fitsInline) return { executor: 'inline' }
  if (input.decision.operation === 'extract') {
    return { executor: 'verbatim_tool' }
  }
  if (input.decision.operation === 'transform') {
    return { executor: 'batch_transform', jobSpec: input.jobSpec }
  }
  return { executor: 'batch_analysis', jobSpec: input.jobSpec }
}

export function formatCoverageDecision(decision: CoverageDecision): string {
  const scope =
    decision.coverage === 'whole'
      ? L({ ko: '전량', en: 'Whole' })
      : L({ ko: '부분', en: 'Targeted' })
  const operation = {
    answer: L({ ko: '질의', en: 'answer' }),
    analysis: L({ ko: '분석', en: 'analysis' }),
    transform: L({ ko: '변환', en: 'transformation' }),
    extract: L({ ko: '추출', en: 'extraction' }),
  }[decision.operation]
  return L({
    ko: `${scope} ${operation} (판정: ${decision.reason})`,
    en: `${scope} ${operation} (reason: ${decision.reason})`,
  })
}
