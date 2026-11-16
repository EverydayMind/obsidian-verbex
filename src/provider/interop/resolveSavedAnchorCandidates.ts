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
import { savedOutputAnchorView } from './savedOutputAnchorView'

const index = z.number().int().nonnegative().safe()
const address = z
  .object({
    kind: z.literal('body'),
    section: z.literal(0),
    paragraph: index,
    sessionId: z.string().min(1).max(256),
    revision: index,
    cellPath: z.array(z.never()).max(0).optional(),
    containerKinds: z.array(z.never()).max(0).optional(),
  })
  .strict()
const schema = z
  .object({
    archiveSha256: z.string(),
    sessionId: z.string().min(1).max(256),
    revision: index,
    candidates: z
      .array(
        z.discriminatedUnion('state', [
          z
            .object({
              blockIndex: index,
              state: z.literal('candidate'),
              address,
            })
            .strict(),
          z
            .object({
              blockIndex: index,
              state: z.literal('unavailable'),
              reason: z.literal('paragraph_missing'),
            })
            .strict(),
        ]),
      )
      .max(50),
  })
  .strict()
export type SavedAnchorCandidate = z.infer<typeof schema>['candidates'][number]

/** User-requested candidates from an already open session, never an edit grant. */
export async function resolveSavedAnchorCandidates(
  host: HostContext,
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
  offset: number,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 50 !== 0)
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.invalidParagraphLocationRange'),
    )
  const observation = await savedOutputAnchorView(
    runtime,
    capture,
    fact,
    conversationId,
  )
  if (!observation || observation.expiresAt <= Date.now())
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.paragraphLocationRecordsExpired'),
    )
  const captureGeneration = capture?.requested(conversationId),
    first = observation.pages[0]
  const anchors = observation.pages
    .flatMap((page) => page.anchors)
    .slice(offset, offset + 50)
  if (
    !first ||
    !anchors.length ||
    host.vaultPath(first.destination) !== first.destination
  )
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.noParagraphLocationsToCheck'),
    )
  const request = {
    path: first.destination,
    archiveSha256: first.archiveSha256,
    anchors,
  }
  const requestDigest = await canonicalDigest(request)
  await host.refresh(signal)
  const providerId = 'hwp-hands',
    found = host.getActiveDiscovered(providerId)
  if (!found || !host.isCurrent(providerId))
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.approvedHWPHandsIsUnavailable'),
    )
  const readApi = () => {
    const api = readDataMember(found.handle.plugin, 'api')
    if (!api || typeof api !== 'object' || readDataMember(api, 'version') !== 1)
      return undefined
    const query = readDataMember(api, 'query')
    if (!query || typeof query !== 'object') return undefined
    const method = readDataMember(query, 'outputAnchorCandidatesIfOpen')
    return typeof method === 'function'
      ? { query, method: method as (...args: unknown[]) => unknown }
      : undefined
  }
  const api = readApi()
  if (!api)
    throw new Error(
      t(
        'ui.resolveSavedAnchorCandidates.hWPHandsOpenDocumentInspectionIsUnavailable',
      ),
    )
  const current = () => {
    const now = host.getActiveDiscovered(providerId),
      live = readApi()
    return (
      !signal?.aborted &&
      !!captureGeneration &&
      capture?.requested(conversationId) === captureGeneration &&
      observation.expiresAt > Date.now() &&
      host.isCurrent(providerId) &&
      now?.handle.provider === found.handle.provider &&
      now.digest === found.digest &&
      now.generation === found.generation &&
      live?.query === api.query &&
      live.method === api.method
    )
  }
  const name = `plg__${providerId}__outputAnchorCandidatesIfOpen`,
    destination = `plugin://${providerId}/query/outputAnchorCandidatesIfOpen`
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({
      version: 1,
      operation: 'outputAnchorCandidatesIfOpen',
    }),
  }
  const turnId = 'saved-output-anchor-candidates'
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
      t('ui.resolveSavedAnchorCandidates.hWPHandsQueryCancelledOrBusy'),
    )
  consumeAuthorizedExecution(permit, { runId: fact.runId, turnId })
  let changes = 0,
    result: Awaited<ReturnType<typeof callProvider>>
  try {
    result = await callProvider({
      app: host.app,
      busy: host.busy,
      providerId,
      signal,
      timeoutMs: Math.min(host.callTimeoutMs ?? 30000, 30000),
      onVaultEvent: () => {
        changes++
      },
      invoke: () => {
        if (!current())
          throw new Error(t('ui.resolveSavedAnchorCandidates.hWPHandsChanged'))
        return Reflect.apply(api.method, api.query, [
          request.path,
          request.archiveSha256,
          anchors.map((item) => ({ ...item })),
        ])
      },
    })
  } catch (error) {
    if (changes)
      throw new Error(
        t(
          'ui.resolveSavedAnchorCandidates.vaultChangesWereObservedDuringTheQuery',
        ),
      )
    throw error
  }
  if (changes || result.vaultEvents)
    throw new Error(
      t(
        'ui.resolveSavedAnchorCandidates.vaultChangesWereObservedDuringTheQuery2',
      ),
    )
  if (!current())
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.hWPHandsStateChangedDuringTheQuery'),
    )
  const parsed = schema.parse(
    copyJson(result.raw, { maxDepth: 8, maxNodes: 1000, maxBytes: 60000 }),
  )
  const after = await savedOutputAnchorView(
    runtime,
    capture,
    fact,
    conversationId,
  )
  const afterAnchors = after?.pages
    .flatMap((page) => page.anchors)
    .slice(offset, offset + 50)
  if (
    !after ||
    after.expiresAt !== observation.expiresAt ||
    after.pages[0]?.sectionSha256 !== first.sectionSha256 ||
    (await canonicalDigest({ ...request, anchors: afterAnchors })) !==
      requestDigest ||
    !current() ||
    parsed.archiveSha256 !== request.archiveSha256 ||
    parsed.candidates.length !== anchors.length ||
    parsed.candidates.some(
      (item, i) =>
        item.blockIndex !== anchors[i].blockIndex ||
        (item.state === 'candidate' &&
          (item.address.paragraph !== anchors[i].paragraph ||
            item.address.sessionId !== parsed.sessionId ||
            item.address.revision !== parsed.revision)),
    )
  )
    throw new Error(
      t('ui.resolveSavedAnchorCandidates.paragraphCandidatesDoNotMatchTheSave'),
    )
  return parsed.candidates
}
