import {
  assertExternalCallMatches,
  canonicalDigest,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import type { Caller } from './protocol'
import type { EditorCandidate } from './turnScope'

export async function issueCapturePermit(
  candidate: EditorCandidate,
  caller: Caller,
  requestId: string,
  name: string,
  destination: string,
) {
  const providerIdentity = {
    serverConfigHash: candidate.digest,
    connectionGeneration: candidate.generation,
    toolSchemaHash: await canonicalDigest({}),
  }
  const execution = await issueLocalPluginCallPermit({
    name,
    args: {},
    runId: caller.runId,
    turnId: requestId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(execution, {
    name,
    args: {},
    destination,
    effect: 'vaultRead',
    providerIdentity,
  })
  return execution
}
