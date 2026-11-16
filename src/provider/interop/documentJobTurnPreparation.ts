import type { HostPrepareResult } from '../../core/document-jobs/hostInitiatedPrepare'

import { jobStatusResult } from './documentJobStatus'
import type { DocumentJobTurnPolicy } from './documentJobTurnPolicy'
export function documentJobTurnPreparation(
  policy: DocumentJobTurnPolicy,
  result: HostPrepareResult,
): HostPrepareResult & { trigger: 'explicit' | 'structural' } {
  return {
    ...result,
    trigger: policy.intended ? ('explicit' as const) : ('structural' as const),
    ...(policy.autoPrepare &&
    result.execution === 'reused' &&
    result.existingJob
      ? {
          samplePath: result.existingJob.samplePath,
          result: jobStatusResult(result.existingJob),
        }
      : {}),
  }
}
