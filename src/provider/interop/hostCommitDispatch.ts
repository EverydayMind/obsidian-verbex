import {
  assertExternalCallMatches,
  consumeAuthorizedExecution,
  issueHostCommitDispatchPermit,
} from '../../security/promptInjectionBoundary'

import type { DocumentJobReadiness } from './documentJobReadiness'
import { HostCommitNotStarted } from './hostInternalCommitTypes'
import type { JsonObject } from './protocol'

/** Consumes a permit for host dispatch, never for provider execution. */
export async function authorizeHostCommitDispatch(input: {
  name: string
  args: JsonObject
  providerId: string
  runId: string
  turnId: string
  providerIdentity: {
    serverConfigHash: string
    connectionGeneration: number
    toolSchemaHash: string
  }
  current: () => boolean
  busy: Set<string>
}): Promise<void> {
  const { name, args, providerId, runId, turnId, providerIdentity } = input
  const permit = await issueHostCommitDispatchPermit({
    name,
    args,
    providerId,
    runId,
    turnId,
    ...providerIdentity,
  })
  await assertExternalCallMatches(permit, {
    name,
    args,
    destination: `plugin://${providerId}/agentinterop/host-commit-dispatch`,
    effect: 'externalMutation',
    providerIdentity,
  })
  if (!input.current() || input.busy.has(providerId))
    throw new Error('Commit tool cancelled, replaced or busy.')
  consumeAuthorizedExecution(permit, { runId, turnId })
}

/** Dispatch authorization happens before any checkpoint or provider write. */
export async function authorizeDocumentJobDispatch(
  run: () => Promise<void>,
  readiness: () => DocumentJobReadiness,
): Promise<void> {
  try {
    await run()
  } catch {
    const latest = readiness()
    if (latest.state !== 'ready')
      throw new HostCommitNotStarted(
        'commit_not_ready',
        latest.state === 'unavailable' ? 'provider_unavailable' : latest.cause,
      )
    throw new HostCommitNotStarted('dispatch_denied')
  }
}
