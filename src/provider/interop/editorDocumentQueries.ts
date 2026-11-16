import { ownershipUnverified } from '../ownershipQueryText'
import type {
  DocumentOwner,
  OwnershipQueryResult,
  UnverifiableProvider,
} from '../ownershipTypes'

import type { DiagnosticSpan } from './diagnostics'
import type { HostContext } from './editorActions'
import { invokeEditor } from './editorCapabilityCall'
import { recordOwnershipQueryFailure } from './ownershipDiagnostics'
import { parseOpenDocuments } from './sessionProtocol'

const documentQueries = new WeakMap<object, Map<string, Promise<unknown>>>()

export function queryAllOpenDocuments(
  host: HostContext,
  providerIds: string[],
  conversationId: string,
  strict: true,
  trace?: DiagnosticSpan,
): Promise<OwnershipQueryResult>
export function queryAllOpenDocuments(
  host: HostContext,
  providerIds: string[],
  conversationId: string,
  strict?: false,
  trace?: DiagnosticSpan,
): Promise<DocumentOwner[]>
export function queryAllOpenDocuments(
  host: HostContext,
  providerIds: string[],
  conversationId: string,
  strict: boolean,
  trace?: DiagnosticSpan,
): Promise<DocumentOwner[] | OwnershipQueryResult>
export async function queryAllOpenDocuments(
  host: HostContext,
  providerIds: string[],
  conversationId: string,
  strict = false,
  trace?: DiagnosticSpan,
): Promise<DocumentOwner[] | OwnershipQueryResult> {
  const all: DocumentOwner[] = []
  const unverifiable: UnverifiableProvider[] = []
  const unavailable = (providerId: string) => {
    if (!strict) return
    const cause = host.currentProviderCause?.(providerId) ?? 'instance_changed'
    unverifiable.push({ providerId, cause })
    recordOwnershipQueryFailure(
      host.diagnostics,
      trace,
      providerId,
      cause,
      undefined,
    )
  }
  for (const providerId of providerIds) {
    const found = host.getActiveDiscovered(providerId)
    if (!found?.handle.editor?.openDocuments) continue
    let category = 'unknown'
    try {
      if (!host.isCurrent(providerId)) {
        unavailable(providerId)
        continue
      }
      let queries = documentQueries.get(found.handle.provider)
      if (!queries)
        documentQueries.set(
          found.handle.provider,
          (queries = new Map<string, Promise<unknown>>()),
        )
      let pending = queries.get(conversationId)
      if (!pending) {
        pending = invokeEditor(
          host,
          providerId,
          conversationId,
          'openDocuments',
          {},
          (editor, caller, signal) => {
            if (!editor.openDocuments)
              throw new Error('Document queries are unavailable.')
            return Reflect.apply(editor.openDocuments, editor.receiver, [
              { caller, requestId: caller.turnId, signal },
            ])
          },
        ).finally(() => queries.delete(conversationId))
        queries.set(conversationId, pending)
      }
      category = 'invocation_failed'
      const raw = await pending
      if (!host.isCurrent(providerId)) {
        unavailable(providerId)
        continue
      }
      category = 'invalid_response'
      const parsed = parseOpenDocuments(raw)
      category = 'invalid_path'
      for (const item of parsed) {
        if (host.vaultPath(item.path) !== item.path)
          throw new Error('The document path is invalid.')
      }
      all.push(...parsed.map((item) => ({ ...item, providerId })))
    } catch (error) {
      if (strict) {
        recordOwnershipQueryFailure(
          host.diagnostics,
          trace,
          providerId,
          category,
          error,
        )
        throw new Error(ownershipUnverified())
      }
      // A provider that is busy, revoked, invalid or unavailable contributes no documents.
    }
  }
  return strict ? { documents: all, unverifiable } : all
}
