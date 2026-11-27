import type { ProviderCurrentCause } from '../currentProvider'
import type { HostContext } from '../editorActions'
import type { Discovered } from '../hostScanTypes'

import { type ReadAssetOutcome, readSkillBody } from './readAsset'

/**
 * What the display read needs from the host. `hostContext()` gives the live
 * discovery map and the current-instance verdict; `options` the read limit.
 */
export type SkillDisplayHost = {
  hostContext(): Pick<
    HostContext,
    'getActiveDiscovered' | 'currentProviderCause'
  >
  options: { readAssetTimeoutMs?: number }
}

export type SkillDisplayRequest = {
  providerId: string
  /** The digest of the reviewed definition; a different instance is refused. */
  digest: string | undefined
  skillId: string
  locale: 'ko' | 'en'
  signal?: AbortSignal
}

/** Waiting for approval, reapproval or switched off: the provider may be reviewed. */
const REVIEWABLE: readonly (ProviderCurrentCause | undefined)[] = [
  undefined,
  'pending',
  'reapproval',
  'disabled',
]

/**
 * Reads and verifies one Skill body for the approval review screen only
 * (host-capabilities-v1: a pending provider may be read for display, never for
 * injection). The result goes to the caller and nowhere else: no cache, no
 * fault record, no ledger. The same Skill body is read again on every call.
 */
export function readSkillForDisplay(
  host: SkillDisplayHost,
  request: SkillDisplayRequest,
): Promise<ReadAssetOutcome> {
  const context = host.hostContext()
  // The host stores the full discovery record behind the narrower context type.
  const lookup = () =>
    context.getActiveDiscovered(request.providerId) as Discovered | undefined
  const found = lookup()
  const entry = found?.assets?.skills.find(
    (item) => item.id === request.skillId && item.locale === request.locale,
  )
  const members = found?.hostMembers
  const sameInstance = () =>
    !!found &&
    !!request.digest &&
    found.digest === request.digest &&
    lookup() === found &&
    REVIEWABLE.includes(context.currentProviderCause?.(request.providerId))
  if (!found || !entry || !members?.readAsset || !sameInstance())
    return Promise.resolve({ ok: false, reason: 'not_current' })
  return readSkillBody({
    receiver: members.receiver,
    request: { kind: 'skill', id: entry.id, locale: request.locale },
    declared: { bodySha256: entry.bodySha256, bodyTokens: entry.bodyTokens },
    stillCurrent: sameInstance,
    timeoutMs: host.options.readAssetTimeoutMs,
    signal: request.signal,
  })
}

/** The read the review screen calls for one provider status. */
export function displayReaderFor(
  host: SkillDisplayHost,
  status: { providerId: string; digest?: string },
): (skill: { id: string; locale: 'ko' | 'en' }) => Promise<ReadAssetOutcome> {
  return (skill) =>
    readSkillForDisplay(host, {
      providerId: status.providerId,
      digest: status.digest,
      skillId: skill.id,
      locale: skill.locale,
    })
}
