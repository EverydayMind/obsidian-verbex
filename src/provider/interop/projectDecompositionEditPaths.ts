import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { TurnRecord } from '../../runstate/turnLedger'
import type { RequestTool } from '../../types/llm/request'

import { decompositionEditPath } from './decompositionEditPath'
import { documentJobHost } from './documentJobHost'
import type { NativeProviderHost } from './NativeProviderHost'
import type { JsonObject } from './protocol'

/** Complete the recommendation only after the final model tool exposure is known. */
export function projectDecompositionEditPaths(
  host: NativeProviderHost | undefined,
  jobs: readonly FormatJob[],
  tools: readonly RequestTool[],
  turn?: TurnRecord,
): void {
  if (!host) return
  for (const job of jobs) {
    if (job.status.state !== 'ready' || !job.status.data.decomposition) continue
    const facts = job.status.data.decomposition.facts,
      data = job.status.data
    const fitness = facts.fitness as JsonObject | undefined
    if (fitness?.grade !== 'C') continue
    fitness.editPath = decompositionEditPath(
      host.hostContext(),
      host.options,
      tools.map((t) => t.function.name),
      data.outputPath,
    )
    documentJobHost(host).store.transition(
      job.id,
      job.conversationId,
      job.sampleSha256,
      { state: 'ready', data },
    )
    const preparation = turn?.documentJobPreparation?.result
    if (preparation?.job_id === job.id && preparation.decomposition)
      (preparation.decomposition as JsonObject).fitness = fitness
  }
}
