import { companionOwnershipPaths } from '../../companionOwnership'
import { ownershipUnverified } from '../../ownershipQueryText'
import {
  OwnershipUnverifiableError,
  type UnverifiableProvider,
} from '../../ownershipTypes'
import type { ProviderCurrentCause } from '../currentProvider'
import { readDataMember } from '../descriptorReader'
import type { HostContext } from '../editorActions'
import type { Discovered } from '../hostScanTypes'
import { recordOwnershipQueryFailure } from '../ownershipDiagnostics'

type PathQuery = { openDocumentPaths(): Promise<unknown> }
type Query = { id: string; found: Discovered; ownership: object; call: unknown }

const adapters = new WeakMap<object, { call: unknown; query: PathQuery }>()

/**
 * One stable adapter per provider ownership object, so the shared bounded
 * query (time, count, length, Vault path checks, concurrent coalescing) treats
 * every caller of the same provider as one.
 */
function adapterFor(ownership: object, call: unknown): PathQuery {
  const known = adapters.get(ownership)
  if (known && known.call === call) return known.query
  const query: PathQuery = {
    openDocumentPaths: () =>
      Reflect.apply(call as () => Promise<unknown>, ownership, []),
  }
  adapters.set(ownership, { call, query })
  return query
}

function causeOf(
  host: HostContext,
  id: string,
): ProviderCurrentCause | undefined {
  return (
    host.currentProviderCause?.(id) ??
    (host.isCurrent(id) ? undefined : 'instance_changed')
  )
}

function readQuery(id: string, found: Discovered): Query {
  const ownership = readDataMember(
    found.hostMembers?.receiver ?? {},
    'ownership',
  )
  if (!ownership || typeof ownership !== 'object')
    throw new Error('ownership member is not an object')
  const call = readDataMember(ownership, 'openDocumentPaths')
  if (typeof call !== 'function')
    throw new Error('openDocumentPaths is not a function')
  return { id, found, ownership, call }
}

/**
 * The companion document paths declared through `ownership.openDocumentPaths()`
 * (host-capabilities-v1 section 5). A provider that declares the member but is
 * not approved, active and current, or whose answer fails in any way, makes
 * the whole answer unverifiable: it never becomes an empty list.
 */
export function nativeCompanionPaths(
  context: () => HostContext,
  providerIds: () => string[],
  timeoutMs?: number,
): () => Promise<string[]> {
  return async () => {
    const host = context()
    await host.refresh()
    const lookup = (id: string) =>
      host.getActiveDiscovered(id) as Discovered | undefined
    const blocked: UnverifiableProvider[] = []
    const queries: Query[] = []
    let failed = false
    for (const id of providerIds()) {
      const found = lookup(id)
      if (!found?.hostMembers?.ownership) continue
      const cause = causeOf(host, id)
      if (cause) {
        blocked.push({ providerId: id, cause })
        recordOwnershipQueryFailure(
          host.diagnostics,
          undefined,
          id,
          cause,
          null,
        )
        continue
      }
      try {
        queries.push(readQuery(id, found))
      } catch (error) {
        failed = true
        recordOwnershipQueryFailure(
          host.diagnostics,
          undefined,
          id,
          'invalid_response',
          error,
        )
      }
    }
    if (blocked.length)
      throw new OwnershipUnverifiableError(
        blocked,
        (id) => lookup(id)?.descriptor?.provider.name,
      )
    const settled = await Promise.allSettled(
      queries.map(({ id, found, ownership, call }) =>
        companionOwnershipPaths(
          adapterFor(ownership, call),
          () => lookup(id) === found && host.isCurrent(id),
          host.app,
          timeoutMs,
        ),
      ),
    )
    const paths: string[] = []
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') return paths.push(...outcome.value)
      failed = true
      recordOwnershipQueryFailure(
        host.diagnostics,
        undefined,
        queries[index].id,
        'invocation_failed',
        outcome.reason,
      )
    })
    if (failed) throw new Error(ownershipUnverified())
    return paths
  }
}

/** Every source must answer; one failure makes the whole answer unverifiable. */
export function unionCompanionPaths(
  ...sources: readonly ((targetPath?: string) => Promise<string[]>)[]
): (targetPath?: string) => Promise<string[]> {
  return async (targetPath) =>
    (await Promise.all(sources.map((source) => source(targetPath)))).flat()
}
