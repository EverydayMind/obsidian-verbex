import type { HostPrepareResult } from './hostInitiatedPrepare'

export function hostPrepareFailure(
  active: boolean,
  samplePath: string,
  error: unknown,
  execution: 'executed' | 'not_executed',
): HostPrepareResult {
  return {
    active,
    fired: true,
    execution,
    samplePath,
    result: {
      state: 'failed',
      code: execution === 'executed' ? 'prepare_failed' : 'sample_unreadable',
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : execution === 'executed'
            ? 'Preparation failed.'
            : 'Sample unreadable.',
    },
  }
}
