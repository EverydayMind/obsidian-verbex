import { copyJson } from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { validators as compiled } from '../../validation/validators'

import { type StyleApi, inspectStyle } from './kordocStyleApi'
import { validateStyleJson } from './schema'
import { type SemanticReplay, validReplayBinding } from './semanticReplay'
import {
  type SemanticSpan,
  measuredContainer,
  validSemanticSpans,
} from './semanticSpans'
import type { StyleSnapshot } from './types'

const validate = compiled.semantic
const validateEvidence = compiled.evidence
export type SemanticResult = {
  analysisSha256: string
  baselineSizePt: number | null
  ruleSetVersion: string
  nodes: {
    ref: string
    state: 'decided' | 'ambiguous' | 'unknown'
    candidates: { role: string; rank: number; evidence: string[] }[]
    level: number | null
    semanticParentRef: string | null
    features: Record<string, unknown>
    spans?: SemanticSpan[]
    spanCoverage?: 'complete' | 'partial'
  }[]
}

export async function readSemanticAnalysis(
  api: StyleApi,
  path: string,
  expectedSource: string,
  expectedMeasurement: string,
  signal?: AbortSignal,
): Promise<SemanticResult> {
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  if (!api.extractSemantic)
    throw new Error('KORDOC semantic analysis unavailable.')
  const response = await api.extractSemantic({
    path,
    expectedSha256: expectedSource,
    signal,
  })
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const raw = copyJson(response, {
    maxDepth: 32,
    maxNodes: 600000,
    maxBytes: 8 * 1024 * 1024,
  }) as Record<string, unknown>
  if (raw.status !== 'ok' || raw.sourcePath !== path)
    throw new Error('Semantic analysis unavailable or source changed.')
  const snapshot = validateStyleJson<StyleSnapshot>('snapshot', raw.snapshot)
  const measurement = await canonicalDigest(snapshot)
  if (
    snapshot.source.sha256 !== expectedSource ||
    raw.measurementSha256 !== measurement ||
    measurement !== expectedMeasurement
  )
    throw new Error('Semantic analysis measurement mismatch.')
  return validateSemanticResult(
    snapshot,
    raw.analysis,
    raw.analysisSha256,
    signal,
  )
}

export async function readSavedSemanticAnalysis(
  api: StyleApi,
  snapshot: StyleSnapshot,
  measurementSha256: string,
  replay: SemanticReplay,
  signal?: AbortSignal,
): Promise<SemanticResult> {
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  if (!api.reanalyzeSemanticEvidence)
    throw new Error('KORDOC semantic evidence replay unavailable.')
  const safeSnapshot = validateStyleJson<StyleSnapshot>('snapshot', snapshot)
  const safeReplay = copyJson(replay, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 32 * 1024 * 1024,
  }) as SemanticReplay
  if (
    !safeReplay ||
    !validateEvidence(safeReplay.evidence) ||
    (await canonicalDigest(safeSnapshot)) !== measurementSha256 ||
    (await canonicalDigest(safeReplay.evidence)) !==
      safeReplay.evidenceSha256 ||
    !validReplayBinding(safeSnapshot, measurementSha256, safeReplay)
  )
    throw new Error('Semantic replay digest or measurement mismatch.')
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const evidenceSha256 = safeReplay.evidenceSha256
  const ruleSetVersion = safeReplay.evidence.ruleSetVersion
  // Both inputs are already bounded, isolated JSON data. The native clone is
  // used only for the second copy; the untrusted input checks above remain.
  let nativeCopy:
    | { snapshot: StyleSnapshot; evidence: SemanticReplay['evidence'] }
    | undefined
  if (typeof structuredClone === 'function') {
    try {
      const candidate = structuredClone({
        snapshot: safeSnapshot,
        evidence: safeReplay.evidence,
      })
      if (
        Object.getPrototypeOf(candidate.snapshot) === Object.prototype &&
        Object.getPrototypeOf(candidate.snapshot.nodes) === Array.prototype &&
        Object.getPrototypeOf(candidate.evidence) === Object.prototype &&
        Object.getPrototypeOf(candidate.evidence.nodes) === Array.prototype
      )
        nativeCopy = candidate
    } catch {
      /* A safe descriptor copy remains available. */
    }
  }
  const provider = nativeCopy ?? {
    snapshot: copyJson(safeSnapshot, {
      maxDepth: 32,
      maxNodes: 1500000,
      maxBytes: 32 * 1024 * 1024,
    }) as unknown as StyleSnapshot,
    evidence: copyJson(safeReplay.evidence, {
      maxDepth: 32,
      maxNodes: 1500000,
      maxBytes: 32 * 1024 * 1024,
    }),
  }
  const response = await api.reanalyzeSemanticEvidence({
    snapshot: provider.snapshot,
    evidence: provider.evidence,
    expectedMeasurementSha256: measurementSha256,
    expectedEvidenceSha256: evidenceSha256,
    signal,
  })
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const raw = copyJson(response, {
    maxDepth: 32,
    maxNodes: 600000,
    maxBytes: 8 * 1024 * 1024,
  }) as Record<string, unknown>
  if (
    raw.status !== 'ok' ||
    raw.measurementSha256 !== measurementSha256 ||
    raw.evidenceSha256 !== evidenceSha256 ||
    !raw.analysis ||
    typeof raw.analysis !== 'object' ||
    (raw.analysis as Record<string, unknown>).ruleSetVersion !== ruleSetVersion
  )
    throw new Error('Saved semantic analysis unavailable or evidence changed.')
  return validateSemanticResult(
    safeSnapshot,
    raw.analysis,
    raw.analysisSha256,
    signal,
  )
}

export async function validateSemanticResult(
  snapshot: StyleSnapshot,
  rawAnalysis: unknown,
  reportedDigest: unknown,
  signal?: AbortSignal,
): Promise<SemanticResult> {
  if (!validate(rawAnalysis)) throw new Error('Invalid semantic analysis.')
  const analysis = rawAnalysis as {
    baselineSizePt: number | null
    ruleSetVersion: string
    nodes: SemanticResult['nodes']
  }
  const digest = await canonicalDigest(rawAnalysis)
  if (
    reportedDigest !== digest ||
    analysis.nodes.length !== snapshot.paragraphs.length
  )
    throw new Error('Semantic analysis digest or node count mismatch.')
  const seriesKinds = new Map<string, string>()
  for (const node of analysis.nodes) {
    const marker = node.features.automaticMarker as
      | { state: string; kind?: string; series?: string }
      | undefined
    if (marker?.state === 'measured' && marker.series && marker.kind) {
      const prior = seriesKinds.get(marker.series)
      if (prior && prior !== marker.kind)
        throw new Error('Semantic marker series conflict.')
      seriesKinds.set(marker.series, marker.kind)
    }
  }
  const seen = new Map<string, SemanticResult['nodes'][number]>()
  const physicalNodes = new Map(snapshot.nodes.map((node) => [node.ref, node]))
  const headingRoles = new Set([
    'DOCUMENT_TITLE',
    'SECTION_HEADING',
    'SUBSECTION_HEADING',
    'ITEM_HEADING',
  ])
  for (let i = 0; i < analysis.nodes.length; i++) {
    const node = analysis.nodes[i]
    const top = node.candidates[0]
    const parent =
      node.semanticParentRef === null ? null : seen.get(node.semanticParentRef)
    const expectedLevel =
      node.state === 'decided' && top && headingRoles.has(top.role)
    if (
      node.ref !== snapshot.paragraphs[i].ref ||
      node.features.container !==
        measuredContainer(snapshot.paragraphs[i], physicalNodes) ||
      seen.has(node.ref) ||
      (node.semanticParentRef !== null &&
        (!parent ||
          parent.state !== 'decided' ||
          ![...headingRoles, 'BULLET_ITEM'].includes(
            parent.candidates[0]?.role,
          ))) ||
      (node.state === 'unknown' && node.candidates.length !== 0) ||
      (node.state === 'decided' && node.candidates.length === 0) ||
      (node.state === 'ambiguous' && node.candidates.length < 2) ||
      (expectedLevel ? node.level === null : node.level !== null) ||
      (node.spans &&
        !validSemanticSpans(
          node.spans,
          snapshot.paragraphs[i].textCodePoints,
          node.features.container,
        )) ||
      (analysis.ruleSetVersion !== 'ko-structure/0.10' &&
        node.spans?.some(
          (span) => span.shape === 'superscript' || span.shape === 'subscript',
        )) ||
      (node.spanCoverage === 'partial' && node.spans?.length !== 32) ||
      new Set(node.candidates.map((candidate) => candidate.role)).size !==
        node.candidates.length ||
      node.candidates.some(
        (candidate, index) =>
          index > 0 && candidate.rank > node.candidates[index - 1].rank,
      )
    )
      throw new Error('Invalid semantic node references or state.')
    seen.set(node.ref, node)
  }
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  return {
    analysisSha256: digest,
    baselineSizePt: analysis.baselineSizePt,
    ruleSetVersion: analysis.ruleSetVersion,
    nodes: analysis.nodes,
  }
}

export async function readSemanticPage(input: {
  api: StyleApi
  path: string
  sourceSha256: string
  measurementSha256: string
  offset: number
  limit: number
  expectedAnalysisSha256?: string
  includePreviews: boolean
  ambiguousOnly?: boolean
  analysis?: SemanticResult
  signal?: AbortSignal
}) {
  const { api, path, sourceSha256, offset, limit, signal } = input
  if (offset > 0 && !input.expectedAnalysisSha256)
    throw new Error('Semantic pagination requires expected_analysis_sha256.')
  if (input.ambiguousOnly && limit > 20)
    throw new Error('Ambiguous semantic pages are limited to 20 nodes.')
  const analysis =
    input.analysis ??
    (await readSemanticAnalysis(
      api,
      path,
      sourceSha256,
      input.measurementSha256,
      signal,
    ))
  if (
    input.expectedAnalysisSha256 &&
    input.expectedAnalysisSha256 !== analysis.analysisSha256
  )
    throw new Error('Semantic analysis changed between pages.')
  const items: SemanticResult['nodes'] = []
  const selected = input.ambiguousOnly
    ? analysis.nodes.filter((node) => node.state !== 'decided')
    : analysis.nodes
  let itemBytes = 2
  for (const item of selected.slice(offset, offset + limit)) {
    const bytes = new TextEncoder().encode(JSON.stringify(item)).byteLength + 1
    if (itemBytes + bytes > 56 * 1024) break
    items.push(item)
    itemBytes += bytes
  }
  if (!items.length && offset < selected.length)
    throw new Error('A semantic node exceeds the page budget.')
  let preview: unknown = null
  if (input.includePreviews && items.length) {
    try {
      const nodes: unknown[] = []
      for (let index = 0; index < items.length; index += 16) {
        const part = (await inspectStyle(api, {
          path,
          expectedSha256: sourceSha256,
          refs: items.slice(index, index + 16).map((item) => item.ref),
          signal,
        })) as
          | { status: 'ok'; nodes: unknown[] }
          | { status: 'error'; code: string }
        if (part.status === 'error') {
          preview = part
          break
        }
        nodes.push(...part.nodes)
      }
      preview ??= { status: 'ok', sourceSha256, nodes }
    } catch {
      if (signal?.aborted) throw new Error('Semantic preview cancelled.')
      preview = { status: 'error', code: 'preview_unavailable' }
    }
  }
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  return {
    analysisSha256: analysis.analysisSha256,
    ruleSetVersion: analysis.ruleSetVersion,
    baselineSizePt: analysis.baselineSizePt,
    items,
    total: selected.length,
    nextOffset:
      offset + items.length < selected.length ? offset + items.length : null,
    ...(preview ? { preview } : {}),
  }
}
