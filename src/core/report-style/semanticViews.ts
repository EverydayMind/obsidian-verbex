import type { ToolArgs } from '../tools/localToolCommon'
import { reportStyleStats } from '../tools/reportStyleSemanticSchema'

import {
  type SemanticOverride,
  readEffectiveStructure,
} from './effectiveStructure'
import type { StyleApi } from './kordocStyleApi'
import { readSemanticPage } from './semanticRead'
import type { ProfileMachine } from './types'

export async function readAnalysisView(input: {
  args: ToolArgs
  api: StyleApi
  path: string
  machine: ProfileMachine
  offset: number
  limit: number
  signal?: AbortSignal
}) {
  const { args, api, path, machine, offset, limit, signal } = input
  const expectedAnalysisSha256 = args.expected_analysis_sha256 as
    | string
    | undefined
  if (args.view === 'structure')
    return readEffectiveStructure({
      api,
      path,
      machine,
      offset,
      limit,
      signal,
      assignments:
        (args.semantic_assignments as SemanticOverride[] | undefined) ?? [],
      expectedAnalysisSha256,
      expectedStructureSha256: args.expected_structure_sha256 as
        | string
        | undefined,
    })
  return readSemanticPage({
    api,
    path,
    sourceSha256: machine.snapshot.source.sha256,
    measurementSha256: machine.measurementSha256,
    offset,
    limit,
    signal,
    expectedAnalysisSha256,
    includePreviews: args.include_source_previews !== false,
    ambiguousOnly: args.view === 'ambiguous',
  })
}
export const isV1StatsView = (view: unknown): boolean =>
  reportStyleStats.views.includes(view as string)
