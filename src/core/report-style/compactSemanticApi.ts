import { copyJson } from '../../provider/interop/descriptorReader'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { validators as compiled } from '../../validation/validators'

import { decodeCompactSnapshot } from './compactSnapshot'
import { validateSemanticResult } from './semanticRead'
import { type SemanticReplay, validReplayBinding } from './semanticReplay'
import type { StyleApi } from './styleApiTypes'

const evidenceValidator = compiled.evidence
const size = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength

/** Explicit provisional bridge; caller must bind the source hash before calling. */
export async function measureCompactSemantic(
  api: StyleApi,
  path: string,
  expectedSourceSha256: string,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  if (
    typeof expectedSourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expectedSourceSha256)
  )
    throw new Error('Expected source hash required.')
  if (!api.extractCompactSemanticEvidence)
    throw new Error('KORDOC compact semantic evidence unavailable.')
  const response = await api.extractCompactSemanticEvidence({
    path,
    expectedSha256: expectedSourceSha256,
    signal,
  })
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const raw = copyJson(response, {
    maxDepth: 32,
    maxNodes: 3000000,
    maxBytes: 64 * 1024 * 1024,
  }) as Record<string, unknown>
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== 8 ||
    raw.status !== 'ok' ||
    raw.sourcePath !== path ||
    typeof raw.measurementSha256 !== 'string' ||
    typeof raw.evidenceSha256 !== 'string'
  )
    throw new Error('Compact semantic evidence unavailable or source changed.')
  if (
    size(raw.evidence) > 4 * 1024 * 1024 ||
    size(raw.analysis) > 8 * 1024 * 1024
  )
    throw new Error('Compact semantic response exceeds limit.')
  const snapshot = await decodeCompactSnapshot(
    raw.packed,
    raw.measurementSha256,
    expectedSourceSha256,
  )
  if (!evidenceValidator(raw.evidence))
    throw new Error('Invalid semantic evidence.')
  const replay = {
    evidence: raw.evidence,
    evidenceSha256: raw.evidenceSha256,
  } as SemanticReplay
  if (
    (await canonicalDigest(replay.evidence)) !== replay.evidenceSha256 ||
    !validReplayBinding(snapshot, raw.measurementSha256, replay)
  )
    throw new Error('Semantic evidence digest or measurement mismatch.')
  const analysis = await validateSemanticResult(
    snapshot,
    raw.analysis,
    raw.analysisSha256,
    signal,
  )
  if (analysis.ruleSetVersion !== replay.evidence.ruleSetVersion)
    throw new Error('Semantic rule version mismatch.')
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  return {
    packed: raw.packed,
    snapshot,
    measurementSha256: raw.measurementSha256,
    semanticReplay: replay,
    analysis,
  }
}

/** Replay a compact measurement without reopening the source document. */
export async function replayCompactSemantic(
  api: StyleApi,
  packed: unknown,
  expectedSourceSha256: string,
  measurementSha256: string,
  replay: SemanticReplay,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  if (!api.reanalyzeCompactSemanticEvidence)
    throw new Error('KORDOC compact semantic replay unavailable.')
  const packedCopy = copyJson(packed, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 32 * 1024 * 1024,
  })
  const saved = copyJson(replay, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 32 * 1024 * 1024,
  }) as SemanticReplay
  const snapshot = await decodeCompactSnapshot(
    packedCopy,
    measurementSha256,
    expectedSourceSha256,
  )
  if (
    !saved ||
    !evidenceValidator(saved.evidence) ||
    size(saved.evidence) > 4 * 1024 * 1024 ||
    (await canonicalDigest(saved.evidence)) !== saved.evidenceSha256 ||
    !validReplayBinding(snapshot, measurementSha256, saved)
  )
    throw new Error('Semantic evidence digest or measurement mismatch.')
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const evidenceSha256 = saved.evidenceSha256
  const ruleSetVersion = saved.evidence.ruleSetVersion
  const response = await api.reanalyzeCompactSemanticEvidence({
    packed: packedCopy,
    evidence: saved.evidence,
    expectedMeasurementSha256: measurementSha256,
    expectedEvidenceSha256: evidenceSha256,
    signal,
  })
  if (signal?.aborted) throw new Error('Semantic analysis cancelled.')
  const raw = copyJson(response, {
    maxDepth: 32,
    maxNodes: 1500000,
    maxBytes: 32 * 1024 * 1024,
  }) as Record<string, unknown>
  if (
    !raw ||
    size(raw) > 8 * 1024 * 1024 ||
    raw.status !== 'ok' ||
    raw.measurementSha256 !== measurementSha256 ||
    raw.evidenceSha256 !== evidenceSha256 ||
    !raw.analysis ||
    typeof raw.analysis !== 'object' ||
    (raw.analysis as Record<string, unknown>).ruleSetVersion !== ruleSetVersion
  )
    throw new Error('Saved semantic analysis unavailable or evidence changed.')
  return validateSemanticResult(
    snapshot,
    raw.analysis,
    raw.analysisSha256,
    signal,
  )
}
