import { verificationVersionProblem } from '../../core/document-jobs/decompose/dialectPolicy'
import type { ReadyData } from '../../core/document-jobs/jobTypes'

import { verifyJobOutput } from './documentJobVerifyOutput'
import { templateVerificationProfile } from './templateVerificationProfile'

/** Verification cannot erase a host-confirmed write or claim whole-document fidelity. */
export async function verifyProductionRoles(
  input: Omit<
    Parameters<typeof verifyJobOutput>[0],
    'profile' | 'droppedBindings'
  > & { data: ReadyData },
): ReturnType<typeof verifyJobOutput> {
  try {
    const problem = verificationVersionProblem(
      input.data.template?.dialect,
      input.data.template?.rulesVersion,
    )
    if (problem) {
      if (input.data.decomposition)
        Object.assign(input.data.decomposition.facts, problem)
      return {
        verification: {
          state: 'unavailable',
          reason: 'verification_rules_version_unsupported',
        },
        ...problem,
      }
    }
    if (input.data.template)
      Object.assign(
        input.data,
        await templateVerificationProfile(
          input.host,
          input.data,
          15,
          input.signal,
        ),
      )
    if (!input.data.machine) throw new Error('sample_unavailable')
    return await verifyJobOutput({
      ...input,
      profile: input.data.machine,
      droppedBindings: input.data.droppedBindings,
    })
  } catch {
    return {
      verification: {
        state: 'unavailable',
        reason:
          input.data.sampleVerificationUnavailable ??
          (input.data.machine
            ? 'verification_unavailable'
            : 'sample_unavailable'),
      },
    }
  }
}
