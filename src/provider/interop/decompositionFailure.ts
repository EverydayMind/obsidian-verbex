import { decompositionFitness } from '../../core/document-jobs/decompose/fitness'
import type { Decomposition } from '../../core/document-jobs/decompose/jobDecomposition'

/** Failed current analysis is a blocked fact, never a retired producer retry. */
export function decompositionFailure(cause: string) {
  return {
    blocked: { reason: 'decomposition_analysis_failed', details: { cause } },
    decomposition: {
      facts: {
        state: 'not_saved',
        cause,
        documentFidelity: 'not_measured_at_runtime',
        fitness: decompositionFitness(undefined),
      },
    } as Decomposition,
  }
}
