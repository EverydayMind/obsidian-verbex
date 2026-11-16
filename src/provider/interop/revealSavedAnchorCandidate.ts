import { z } from 'zod'

import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import type { CommitRuntime } from './commitPrepare'
import type { CommitFact } from './commitStatus'
import { copyJson, readDataMember } from './descriptorReader'
import type { HostContext } from './editorActions'
import type { OutputAnchorCapture } from './outputAnchorCapture'
import { callProvider } from './providerCall'
import { resolveSavedAnchorCandidates } from './resolveSavedAnchorCandidates'
import { savedOutputAnchorView } from './savedOutputAnchorView'

/** Human click only. A failed or interrupted call must never be retried automatically. */
export async function revealSavedAnchorCandidate(
  host: HostContext,
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
  offset: number,
  blockIndex: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0)
    throw new Error(t('ui.revealSavedAnchorCandidate.invalidParagraphLocation'))
  const generation = capture?.requested(conversationId)
  const candidates = await resolveSavedAnchorCandidates(
    host,
    runtime,
    capture,
    fact,
    conversationId,
    offset,
    signal,
  )
  const candidate = candidates.find((item) => item.blockIndex === blockIndex)
  if (!candidate || candidate.state !== 'candidate')
    throw new Error(
      t('ui.revealSavedAnchorCandidate.noCurrentParagraphCandidates'),
    )
  const observation = await savedOutputAnchorView(
    runtime,
    capture,
    fact,
    conversationId,
  )
  const first = observation?.pages[0],
    anchor = observation?.pages
      .flatMap((page) => page.anchors)
      .slice(offset, offset + 50)
      .find((item) => item.blockIndex === blockIndex)
  if (
    !first ||
    !anchor ||
    !generation ||
    capture?.requested(conversationId) !== generation ||
    observation.expiresAt <= Date.now() ||
    anchor.paragraph !== candidate.address.paragraph
  )
    throw new Error(
      t('ui.revealSavedAnchorCandidate.paragraphLocationRecordsExpired'),
    )
  const request = {
    path: first.destination,
    archiveSha256: first.archiveSha256,
    anchor,
    sessionId: candidate.address.sessionId,
    revision: candidate.address.revision,
  }
  if (host.vaultPath(request.path) !== request.path)
    throw new Error(t('ui.revealSavedAnchorCandidate.invalidDocumentPath'))
  await host.refresh(signal)
  const providerId = 'hwp-hands',
    found = host.getActiveDiscovered(providerId)
  if (!found || !host.isCurrent(providerId))
    throw new Error(
      t('ui.revealSavedAnchorCandidate.approvedHWPHandsIsUnavailable'),
    )
  const readApi = () => {
    const api = readDataMember(found.handle.plugin, 'api')
    if (!api || typeof api !== 'object' || readDataMember(api, 'version') !== 1)
      return undefined
    const views = readDataMember(api, 'views')
    if (!views || typeof views !== 'object') return undefined
    const method = readDataMember(views, 'revealOutputAnchor')
    return typeof method === 'function'
      ? { views, method: method as (...args: unknown[]) => unknown }
      : undefined
  }
  const api = readApi()
  if (!api)
    throw new Error(
      t(
        'ui.revealSavedAnchorCandidate.hWPHandsLocationNavigationIsUnavailable',
      ),
    )
  const current = () => {
    const now = host.getActiveDiscovered(providerId),
      live = readApi()
    return (
      !signal?.aborted &&
      capture?.requested(conversationId) === generation &&
      observation.expiresAt > Date.now() &&
      host.isCurrent(providerId) &&
      now?.handle.provider === found.handle.provider &&
      now.digest === found.digest &&
      now.generation === found.generation &&
      live?.views === api.views &&
      live.method === api.method
    )
  }
  const name = `plg__${providerId}__revealOutputAnchor`,
    destination = `plugin://${providerId}/views/revealOutputAnchor`
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({
      version: 1,
      operation: 'revealOutputAnchor',
    }),
  }
  const turnId = 'saved-output-anchor-reveal'
  const permit = await issueLocalPluginCallPermit({
    name,
    args: request,
    runId: fact.runId,
    turnId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(permit, {
    name,
    args: request,
    destination,
    effect: 'vaultRead',
    providerIdentity,
  })
  if (!current() || host.busy.has(providerId))
    throw new Error(
      t(
        'ui.revealSavedAnchorCandidate.locationNavigationCancelledOrThePluginIs',
      ),
    )
  consumeAuthorizedExecution(permit, { runId: fact.runId, turnId })
  const { raw, vaultEvents } = await callProvider({
    app: host.app,
    busy: host.busy,
    providerId,
    signal,
    timeoutMs: Math.min(host.callTimeoutMs ?? 30000, 30000),
    invoke: (callSignal) => {
      if (!current())
        throw new Error(
          t(
            'ui.revealSavedAnchorCandidate.stateChangedBeforeLocationNavigation',
          ),
        )
      return Reflect.apply(api.method, api.views, [
        { ...request, anchor: { ...anchor } },
        callSignal,
      ])
    },
  })
  if (vaultEvents || !current())
    throw new Error(
      t(
        'ui.revealSavedAnchorCandidate.stateChangedDuringLocationNavigationCheckThe',
      ),
    )
  z.object({ revealed: z.literal(true), located: z.literal(true) })
    .strict()
    .parse(copyJson(raw, { maxDepth: 3, maxNodes: 10, maxBytes: 1024 }))
}
