import { planRoleAnchors } from '../../core/document-jobs/roleAnchorPlan'
import { verifyMappedRoles } from '../../core/document-jobs/roleVerification'
import type {
  Binding,
  ProfileMachine,
  StyleSnapshot,
} from '../../core/report-style/types'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { hashJobOutput, measureJobOutput } from './documentJobMeasureOutput'
import type { HostContext } from './editorActions'
import type { InternalCommitFacts } from './hostInternalCommitTypes'
import type { SavedAnchorReference } from './resolveSavedAnchorRefs'

type Unavailable = { verification: { state: 'unavailable'; reason: string } }
type Verified = {
  verification: { state: 'complete' }
  roles: ReturnType<typeof verifyMappedRoles>['roles']
  mapping: ReturnType<typeof verifyMappedRoles>['mapping']
  outputSnapshot: StyleSnapshot
}

/** Runs inside the commit callback while the host's anchor lease is live. */
export async function verifyJobOutput(input: {
  host: HostContext
  facts: InternalCommitFacts
  profile: ProfileMachine
  droppedBindings: readonly Binding[]
  path: string
  runId: string
  turnId: string
  signal?: AbortSignal
}): Promise<Unavailable | Verified> {
  const unavailable = (reason: string): Unavailable => ({
    verification: { state: 'unavailable', reason },
  })
  if (
    input.facts.outcome.status !== 'succeeded' ||
    input.facts.outcome.mutation !== 'applied' ||
    input.facts.outcome.commit?.needsAttention ||
    input.facts.outcome.commit?.state !== 'written' ||
    input.facts.outcome.commit.destination !== input.path
  )
    return unavailable('written_checkpoint_unavailable')
  let pages: Awaited<ReturnType<InternalCommitFacts['readBoundAnchors']>> =
    undefined
  try {
    pages = await input.facts.readBoundAnchors()
  } catch {
    return unavailable('anchors_unavailable')
  }
  if (!pages?.length) return unavailable('anchors_unavailable')
  if (pages[0].destination !== input.path)
    return unavailable('anchor_destination_mismatch')
  let plan
  try {
    plan = planRoleAnchors(input.profile.bindings, pages)
  } catch (error) {
    return unavailable(
      error instanceof Error && error.message === 'Anchor stream incomplete.'
        ? 'anchors_incomplete'
        : 'anchors_invalid',
    )
  }
  const pageDigest = await canonicalDigest(pages),
    references: SavedAnchorReference[] = []
  try {
    for (let i = 0; i < plan.selected.length; i += 50)
      references.push(
        ...(await input.facts.resolveOutputAnchorRefs(
          plan.selected.slice(i, i + 50),
        )),
      )
  } catch {
    return unavailable('anchor_resolution_unavailable')
  }
  let output
  try {
    output = await measureJobOutput(input.host, {
      path: input.path,
      expectedSha256: pages[0].archiveSha256,
      runId: input.runId,
      turnId: input.turnId,
      signal: input.signal,
    })
  } catch {
    return unavailable('output_measurement_unavailable')
  }
  try {
    const after = await input.facts.readBoundAnchors()
    if (
      !after ||
      (await canonicalDigest(after)) !== pageDigest ||
      (await hashJobOutput(input.host, input.path)) !== pages[0].archiveSha256
    )
      return unavailable('output_or_anchors_changed')
    const report = verifyMappedRoles({
      profile: input.profile,
      output: output.snapshot,
      plan,
      references,
      droppedBindings: input.droppedBindings,
    })
    return {
      verification: { state: 'complete' },
      ...report,
      outputSnapshot: output.snapshot,
    }
  } catch {
    return unavailable('verification_unavailable')
  }
}
