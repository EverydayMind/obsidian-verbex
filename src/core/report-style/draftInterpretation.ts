import type { App } from 'obsidian'

import { AiPrivateReadError } from '../../security/aiPrivateRefusal'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { computeProfileStats } from './computedStats'
import {
  type BoundDraftInputs,
  bindDraftInputs,
  recheckBoundDraftInputs,
} from './draftInputs'
import { projectDraftRoles } from './draftRoleProjection'
import { compareDraftToStats } from './draftStatsComparison'
import { guardStyleApi } from './guardedStyleApi'
import { getStyleApi } from './kordocStyleApi'
import type { ReportStylePorts } from './ports'

/** Internal interpretation only: callers must retain the partial coverage fact. */
export function interpretBoundDraft(input: BoundDraftInputs) {
  if (input.profile.schema !== 'report-style-profile/2')
    return { state: 'unavailable' as const, reason: 'profile_v1' as const }
  const nodes = projectDraftRoles(
    input.observed.blocks,
    input.profile.roleStyleMap,
  )
  return {
    state: 'available' as const,
    inputsDigest: input.inputsDigest,
    coverage: input.observed.coverage,
    counts: {
      resolved: nodes.filter((node) => node.state === 'resolved').length,
      ambiguous: nodes.filter((node) => node.state === 'ambiguous').length,
      unmapped: nodes.filter((node) => node.state === 'unmapped').length,
    },
    nodes,
  }
}

export async function prepareInterpretedDraft(
  app: App,
  ports: ReportStylePorts,
  input: Parameters<typeof bindDraftInputs>[2],
) {
  const bound = await bindDraftInputs(app, ports, input)
  if (bound.state !== 'available') return bound
  const interpretation = interpretBoundDraft(bound)
  if (
    bound.profile.schema !== 'report-style-profile/2' ||
    interpretation.state !== 'available'
  )
    return {
      ...bound,
      interpretation,
      statistics: {
        state: 'unavailable' as const,
        reason: 'profile_v1' as const,
      },
    }
  let computed: Awaited<ReturnType<typeof computeProfileStats>> | null = null
  try {
    computed = await computeProfileStats(
      bound.profile,
      () => guardStyleApi(ports.styleApi?.() ?? getStyleApi(app)),
      bound.profile.sourcePath,
      input.signal,
    )
  } catch (error) {
    input.signal?.throwIfAborted()
    if (error instanceof AiPrivateReadError) throw error
  }
  const checked = await recheckBoundDraftInputs(app, input, bound)
  if (!checked.unchanged)
    return {
      state: 'input_changed' as const,
      before: bound.before,
      after: checked.after,
    }
  if (!computed)
    return {
      ...bound,
      interpretation,
      statistics: {
        state: 'unavailable' as const,
        reason: 'semantic_analysis_unavailable' as const,
      },
    }
  if (computed.state !== 'available')
    return { ...bound, interpretation, statistics: computed }
  const comparison = compareDraftToStats(interpretation.nodes, computed.summary)
  const comparisonInputsDigest = await canonicalDigest({
    draftInputsDigest: bound.inputsDigest,
    statsSha256: computed.statsSha256,
  })
  return {
    ...bound,
    interpretation,
    statistics: {
      ...comparison,
      inputsSha256: computed.inputsSha256,
      statsSha256: computed.statsSha256,
      comparisonInputsDigest,
    },
  }
}
