import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import type { CommitCall, CommitRuntime, PreparedCommit } from './commitPrepare'
import { copyJson, readDataMember } from './descriptorReader'
import type { ProviderHandle } from './discovery'
import {
  type SavedOutputAnchorPage,
  savedOutputAnchorPageSchema,
} from './outputAnchorSchema'
import { callProvider } from './providerCall'

export type { SavedOutputAnchorPage } from './outputAnchorSchema'
export type OutputAnchorScope = {
  conversationId: string
  runId: string
  expiresAt: string
  /** Present only for a host-owned, run-bound collection. */
  leaseId?: string
}
export type OutputAnchorHandler = (
  page: SavedOutputAnchorPage,
  scope: OutputAnchorScope,
) => void
export type OutputAnchorRuntime = {
  outputAnchors?: OutputAnchorHandler
  outputAnchorRequested?: (conversationId: string) => boolean | number
  outputAnchorLeaseCurrent?: (
    leaseId: string,
    conversationId: string,
    runId: string,
  ) => boolean
  outputAnchorLeaseLimit?: (leaseId: string, expiresAt: string) => void
}
export type OutputAnchorCapability = {
  method: (...args: unknown[]) => unknown
  selection:
    | { kind: 'user'; generation: boolean | number | undefined }
    | { kind: 'lease'; leaseId: string }
}
export function limitOutputAnchorLease(
  runtime: OutputAnchorRuntime,
  capability: OutputAnchorCapability | undefined,
  expiresAt: string,
): void {
  if (capability?.selection.kind === 'lease')
    runtime.outputAnchorLeaseLimit?.(capability.selection.leaseId, expiresAt)
}
class OutputAnchorVaultChanged extends Error {}

export function outputAnchorCapability(
  call: CommitCall,
  commit: NonNullable<ProviderHandle['commit']>,
  runtime: CommitRuntime,
) {
  const conversationId = call.ctx.conversationId ?? call.ctx.runId ?? ''
  const runId = call.ctx.runId ?? ''
  const generation = runtime.outputAnchorRequested?.(conversationId)
  const leaseId = call.hostOutputAnchorLeaseId
  const selection: OutputAnchorCapability['selection'] = leaseId
    ? { kind: 'lease', leaseId }
    : { kind: 'user', generation }
  if (
    !runtime.outputAnchors ||
    (leaseId
      ? !runtime.outputAnchorLeaseLimit ||
        !runtime.outputAnchorLeaseCurrent?.(leaseId, conversationId, runId)
      : !!runtime.outputAnchorRequested && !generation) ||
    call.handle.pluginId !== 'md-to-hwpx' ||
    call.tool.name !== 'export_note'
  )
    return undefined
  try {
    const member = readDataMember(commit.receiver, 'outputAnchors')
    return typeof member === 'function'
      ? { method: member as (...args: unknown[]) => unknown, selection }
      : undefined
  } catch {
    return undefined
  }
}

export async function trySavedOutputAnchors(
  call: CommitCall,
  prepared: PreparedCommit,
  state: string,
): Promise<boolean> {
  if (state !== 'written') return true
  try {
    await readSavedOutputAnchors(call, prepared)
  } catch (error) {
    if (error instanceof OutputAnchorVaultChanged) {
      call.reportFault?.()
      return false
    }
  }
  return true
}

/** Optional provider observation, never a receipt, edit grant, or persisted fact. */
export async function readSavedOutputAnchors(
  call: CommitCall,
  prepared: PreparedCommit,
): Promise<void> {
  const capability = prepared.outputAnchors,
    method = capability?.method,
    deliver = prepared.runtime.outputAnchors
  const entry = prepared.preparation.writeSet.find(
    (item) =>
      item.kind === 'file' &&
      item.path === prepared.destination &&
      item.role === 'primary',
  )
  if (!method || !deliver || !entry || entry.kind !== 'file') return
  const current = () =>
    !prepared.stopped() &&
    (capability.selection.kind === 'lease'
      ? !!prepared.runtime.outputAnchorLeaseCurrent?.(
          capability.selection.leaseId,
          prepared.caller.conversationId,
          prepared.runId,
        )
      : !prepared.runtime.outputAnchorRequested ||
        prepared.runtime.outputAnchorRequested(
          prepared.caller.conversationId,
        ) === capability.selection.generation) &&
    readDataMember(prepared.commit.receiver, 'outputAnchors') === method
  const request = {
    preparationId: prepared.preparation.preparationId,
    preparationDigest: prepared.preparation.preparationDigest,
    archiveSha256: entry.sha256Expected,
    offset: 0,
    limit: 500,
  }
  const name = `plg__${call.handle.pluginId}__outputAnchors`
  const destination = `plugin://${call.handle.pluginId}/agentinterop/commit/outputAnchors`
  const providerIdentity = {
    serverConfigHash: call.digest,
    connectionGeneration: call.generation,
    toolSchemaHash: await canonicalDigest(call.tool.inputSchema),
  }
  const pages: SavedOutputAnchorPage[] = []
  const blocks = new Set<number>(),
    paragraphs = new Set<number>()
  let lastBlock = -1
  const deadline =
    Date.now() + Math.min(prepared.runtime.timeoutMs ?? 30000, 30000)
  while (pages.length < 10) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return
    const permit = await issueLocalPluginCallPermit({
      name,
      args: request,
      runId: prepared.runId,
      turnId: prepared.requestId,
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
    if (
      !current() ||
      call.busy.has(call.handle.pluginId) ||
      Date.now() >= deadline
    )
      return
    consumeAuthorizedExecution(permit, {
      runId: prepared.runId,
      turnId: prepared.requestId,
    })
    let changes = 0
    let result: Awaited<ReturnType<typeof callProvider>>
    try {
      result = await callProvider({
        app: call.app,
        busy: call.busy,
        providerId: call.handle.pluginId,
        signal: call.ctx.signal,
        timeoutMs: Math.max(1, deadline - Date.now()),
        onVaultEvent: () => {
          changes++
        },
        invoke: (signal) => {
          if (!current()) throw new Error('Anchor provider changed.')
          return Reflect.apply(method, prepared.commit.receiver, [
            { ...request },
            prepared.invocation(signal),
          ])
        },
      })
    } catch (error) {
      if (changes) throw new OutputAnchorVaultChanged()
      throw error
    }
    if (changes) throw new OutputAnchorVaultChanged()
    if (!current() || Date.now() >= deadline) return
    const { raw } = result
    const page = savedOutputAnchorPageSchema.parse(
      copyJson(raw, { maxDepth: 8, maxNodes: 4000, maxBytes: 200000 }),
    )
    const first = pages[0]
    const end = request.offset + page.anchors.length
    if (
      page.preparationId !== request.preparationId ||
      page.preparationDigest !== request.preparationDigest ||
      page.destination !== prepared.destination ||
      page.archiveSha256 !== request.archiveSha256 ||
      page.offset !== request.offset ||
      (first &&
        (page.version !== first.version ||
          page.total !== first.total ||
          page.sectionSha256 !== first.sectionSha256)) ||
      (page.total > request.offset && page.anchors.length === 0) ||
      end > page.total ||
      page.nextOffset !== (end < page.total ? end : null)
    )
      return
    for (const anchor of page.anchors) {
      if (
        anchor.blockIndex <= lastBlock ||
        blocks.has(anchor.blockIndex) ||
        paragraphs.has(anchor.paragraph)
      )
        return
      blocks.add(anchor.blockIndex)
      paragraphs.add(anchor.paragraph)
      lastBlock = anchor.blockIndex
    }
    pages.push(page)
    if (page.nextOffset === null) break
    request.offset = page.nextOffset
  }
  if (!current() || Date.now() >= deadline) return
  for (const page of pages)
    deliver(page, {
      conversationId: prepared.caller.conversationId,
      runId: prepared.runId,
      expiresAt: prepared.preparation.expiresAt,
      ...(capability.selection.kind === 'lease'
        ? { leaseId: capability.selection.leaseId }
        : {}),
    })
}
