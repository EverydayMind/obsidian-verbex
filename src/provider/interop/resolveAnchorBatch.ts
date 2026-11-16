import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'
import { KORDOC_PROVIDER_ID } from '../contract'

import type { CommitFact } from './commitStatus'
import { copyJson, readDataMember } from './descriptorReader'
import type { HostContext } from './editorActions'
import type { SavedOutputAnchorPage } from './outputAnchorRead'
import { callProvider } from './providerCall'
import { anchorCoordinates, attachAnchorEvidence } from './savedAnchorEvidence'
import {
  type SavedAnchorReference,
  resultSchema,
} from './savedAnchorReferenceSchema'
export type { SavedAnchorReference } from './savedAnchorReferenceSchema'

type Observation = { expiresAt: number; pages: SavedOutputAnchorPage[] }
/** One lease- or user-scoped KORDOC read with identical capability checks. */
export async function resolveAnchorBatch(input: {
  host: HostContext
  fact: CommitFact
  signal?: AbortSignal
  observe: () => Promise<Observation | undefined>
  scopeCurrent: () => boolean
  select: (pages: SavedOutputAnchorPage[]) => SavedOutputAnchorPage['anchors']
}): Promise<SavedAnchorReference[]> {
  const { host, fact, signal, observe, scopeCurrent, select } = input
  const observation = await observe()
  if (!observation || observation.expiresAt <= Date.now() || !scopeCurrent())
    throw new Error(t('ui.resolveAnchorBatch.paragraphLocationRecordsExpired'))
  const first = observation.pages[0]
  const anchors = select(observation.pages)
  if (
    !first ||
    !anchors.length ||
    anchors.length > 50 ||
    new Set(anchors.map((anchor) => anchor.blockIndex)).size !==
      anchors.length ||
    host.vaultPath(first.destination) !== first.destination
  )
    throw new Error(t('ui.resolveAnchorBatch.noParagraphLocationsToCheck'))
  const request = {
    path: first.destination,
    expectedSha256: first.archiveSha256,
    sectionSha256: first.sectionSha256,
    anchors: anchorCoordinates(anchors),
  }
  await host.refresh(signal)
  const providerId = KORDOC_PROVIDER_ID,
    found = host.getActiveDiscovered(providerId)
  if (!found || !host.isCurrent(providerId))
    throw new Error(t('ui.resolveAnchorBatch.approvedKORDOCIsUnavailable'))
  const readApi = () => {
    const api = readDataMember(found.handle.plugin, 'api')
    const style =
      api && typeof api === 'object'
        ? readDataMember(api, 'styleProfile')
        : undefined
    if (
      !style ||
      typeof style !== 'object' ||
      readDataMember(style, 'version') !== 1
    )
      return undefined
    const method = readDataMember(style, 'resolveOutputAnchors')
    return typeof method === 'function'
      ? { style, method: method as (...args: unknown[]) => unknown }
      : undefined
  }
  const api = readApi()
  if (!api)
    throw new Error(
      t(
        'ui.resolveAnchorBatch.kORDOCParagraphReferenceVerificationIsUnavailable',
      ),
    )
  const current = () => {
    const now = host.getActiveDiscovered(providerId),
      live = readApi()
    return (
      !signal?.aborted &&
      scopeCurrent() &&
      observation.expiresAt > Date.now() &&
      host.isCurrent(providerId) &&
      now?.handle.provider === found.handle.provider &&
      now.digest === found.digest &&
      now.generation === found.generation &&
      live?.style === api.style &&
      live.method === api.method
    )
  }
  const name = `plg__${providerId}__resolveOutputAnchors`,
    destination = `plugin://${providerId}/styleProfile/resolveOutputAnchors`
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({
      version: 1,
      operation: 'resolveOutputAnchors',
    }),
  }
  const turnId = 'saved-output-anchor-view'
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
    throw new Error(t('ui.resolveAnchorBatch.kORDOCQueryCancelledOrBusy'))
  consumeAuthorizedExecution(permit, { runId: fact.runId, turnId })
  let observedChanges = 0
  let resultFromProvider: Awaited<ReturnType<typeof callProvider>>
  try {
    resultFromProvider = await callProvider({
      app: host.app,
      busy: host.busy,
      providerId,
      signal,
      timeoutMs: Math.min(host.callTimeoutMs ?? 30000, 30000),
      onVaultEvent: () => {
        observedChanges++
      },
      invoke: (callSignal) => {
        if (!current())
          throw new Error(t('ui.resolveAnchorBatch.kORDOCChanged'))
        return Reflect.apply(api.method, api.style, [
          {
            ...request,
            anchors: request.anchors.map((item) => ({ ...item })),
            signal: callSignal,
          },
        ])
      },
    })
  } catch (error) {
    if (observedChanges)
      throw new Error(
        t('ui.resolveAnchorBatch.vaultChangesWereObservedDuringTheQuery'),
      )
    throw error
  }
  const { raw, vaultEvents } = resultFromProvider
  if (vaultEvents)
    throw new Error(
      t('ui.resolveAnchorBatch.vaultChangesWereObservedDuringTheQuery2'),
    )
  if (!current())
    throw new Error(t('ui.resolveAnchorBatch.kORDOCStateChangedDuringTheQuery'))
  const result = resultSchema.parse(
    copyJson(raw, { maxDepth: 8, maxNodes: 600, maxBytes: 40000 }),
  )
  const matchedRefs = result.anchors.flatMap((item) =>
    item.state === 'matched' ? [item.ref] : [],
  )
  if (new Set(matchedRefs).size !== matchedRefs.length)
    throw new Error('Duplicate output paragraph references.')
  const after = await observe()
  const afterAnchors = after ? select(after.pages) : undefined
  if (
    !after ||
    !scopeCurrent() ||
    after.expiresAt <= Date.now() ||
    after.expiresAt !== observation.expiresAt ||
    after.pages[0]?.sectionSha256 !== request.sectionSha256 ||
    (await canonicalDigest(afterAnchors)) !==
      (await canonicalDigest(anchors)) ||
    after.expiresAt <= Date.now() ||
    !current() ||
    result.archiveSha256 !== request.expectedSha256 ||
    result.sectionSha256 !== request.sectionSha256 ||
    result.anchors.length !== anchors.length ||
    result.anchors.some((item, i) => item.blockIndex !== anchors[i].blockIndex)
  )
    throw new Error(
      t('ui.resolveAnchorBatch.paragraphReferencesDoNotMatchTheSave'),
    )
  return attachAnchorEvidence(result.anchors, anchors)
}
