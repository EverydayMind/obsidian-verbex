import { canonicalDigest } from '../../security/promptInjectionBoundary'

import {
  type StructureNode,
  readEffectiveStructure,
} from './effectiveStructure'
import type { StyleApi } from './kordocStyleApi'
import type { ProfileV2 } from './profileV2'
import { readProfileSemanticAnalysis } from './savedSemanticAnalysis'
import { persistedSemanticOverrides } from './semanticOverrides'
import {
  SEMANTIC_STATS_VERSION,
  summarizeSemanticStructure,
} from './semanticStats'
import type { ProfileMachine } from './types'

/** Compute from stored text-free evidence and corrected effective roles, without reading the sample. */
export async function computeProfileStats(
  machine: ProfileV2,
  api: () => StyleApi,
  path: string,
  signal?: AbortSignal,
  compact = false,
) {
  const saved = machine.semanticReplay
  if (!saved || saved.evidence.schema === 'report-style-semantic-evidence/0.1')
    return {
      state: 'unavailable' as const,
      reason: 'text_features_not_captured' as const,
    }
  const styleApi = api()
  const analysis = await readProfileSemanticAnalysis(
    styleApi,
    machine.snapshot,
    machine.measurementSha256,
    saved,
    signal,
    compact,
  )
  let nodes: readonly StructureNode[] | undefined
  await readEffectiveStructure({
    api: styleApi,
    path,
    machine: machine as unknown as ProfileMachine,
    analysis,
    assignments: [],
    persistedAssignments: persistedSemanticOverrides(machine),
    offset: 0,
    limit: 1,
    signal,
    captureNodes: (value) => {
      nodes = value
    },
  })
  if (!nodes || signal?.aborted)
    throw new Error('Statistics calculation cancelled or incomplete.')
  const summary = summarizeSemanticStructure(nodes, saved.evidence)
  const inputsSha256 = await canonicalDigest({
    measurementSha256: machine.measurementSha256,
    evidenceSha256: saved.evidenceSha256,
    analysisSha256: analysis.analysisSha256,
    semanticsSha256: machine.semanticsSha256,
    statsVersion: SEMANTIC_STATS_VERSION,
  })
  const statsSha256 = await canonicalDigest({ inputsSha256, summary })
  if (signal?.aborted) throw new Error('Statistics calculation cancelled.')
  return {
    state: 'available' as const,
    statsState: 'computed_preview' as const,
    inputsSha256,
    statsSha256,
    summary,
  }
}
