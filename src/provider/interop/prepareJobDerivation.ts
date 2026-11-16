import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { BindingCandidates } from '../../core/report-style/bindingCandidates'
import type { StyleSnapshot } from '../../core/report-style/types'

import { analyzeJobDecomposition } from './analyzeJobDecomposition'
import { decompositionBodyChoice } from './decompositionBodyChoice'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import { preparedDecomposition } from './preparedDecomposition'

export async function prepareJobDerivation(input: {
  host: HostContext
  samplePath: string
  snapshot: StyleSnapshot
  candidates: BindingCandidates
  bodyRef: string
  bodyChosenBy?: 'rule' | 'user' | 'model'
  signal?: AbortSignal
  job: FormatJob
  options?: NativeHostOptions
}) {
  const analysis = await analyzeJobDecomposition(
    input.host,
    input.job,
    input.signal,
    input.options,
    input.bodyChosenBy === 'user' || input.bodyChosenBy === 'model'
      ? input.bodyRef
      : undefined,
  )
  if (analysis && 'blocked' in analysis && analysis.blocked)
    return { state: 'blocked' as const, ...analysis.blocked }
  if (analysis && 'bodyChoiceModel' in analysis && analysis.bodyChoiceModel)
    return decompositionBodyChoice(
      input.host,
      input.job,
      analysis.bodyChoiceModel,
      input.signal,
    )
  if (analysis && 'model' in analysis && analysis.model)
    return preparedDecomposition(analysis)
  return {
    state: 'blocked' as const,
    reason: 'decomposition_analysis_failed',
    details: { cause: 'analysis_unavailable' },
  }
}
