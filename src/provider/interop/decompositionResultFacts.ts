import { decompositionNextStep } from '../../core/document-jobs/decompose/jobDecomposition'
import type { FormatJob, ReadyData } from '../../core/document-jobs/jobTypes'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { documentJobNextStep } from './documentJobDraftInput'
import type { JsonObject } from './protocol'

export function decompositionStatusFacts(job: FormatJob): JsonObject {
  if (job.status.state !== 'ready') throw new Error('Job is not ready.')
  const data = job.status.data,
    fitness = data.decomposition?.facts.fitness as JsonObject | undefined
  const ask = fitness?.grade === 'C' && data.decomposition?.explicit !== true
  return {
    ...(!ask
      ? {
          nextStep: decompositionNextStep(data.decomposition)
            ? {
                tool: 'save_format_decomposition',
                arguments: { job_id: job.id },
                then: ['write_file', 'produce_format_reuse'],
              }
            : documentJobNextStep(job),
        }
      : {}),
    ...(data.decomposition ? { decomposition: data.decomposition.facts } : {}),
  }
}
export function decompositionProductionFacts(data: ReadyData): JsonObject {
  return {
    ...(data.decomposition
      ? {
          decomposition: data.decomposition.facts,
          documentFidelity: 'not_measured_at_runtime',
        }
      : {}),
    ...(data.template
      ? {
          template: {
            path: data.template.path,
            sha256: data.template.sha256,
            state: data.template.state,
          },
          documentFidelity: 'not_measured_at_runtime',
        }
      : {}),
  }
}
export function decompositionReceiptFacts(
  data: ReadyData,
): Partial<
  Pick<
    NonNullable<AgentToolOutcome['documentJobReceipt']>,
    'decomposition' | 'template' | 'documentFidelity'
  >
> {
  return {
    ...(data.decomposition
      ? {
          decomposition: {
            state: stringifyUnknown(data.decomposition.facts.state),
            ...(typeof data.decomposition.facts.cause === 'string'
              ? { cause: data.decomposition.facts.cause }
              : {}),
          },
          documentFidelity: 'not_measured_at_runtime' as const,
        }
      : {}),
    ...(data.template
      ? {
          template: {
            path: data.template.path,
            sha256: data.template.sha256,
            state: data.template.state,
          },
          documentFidelity: 'not_measured_at_runtime' as const,
        }
      : {}),
  }
}
