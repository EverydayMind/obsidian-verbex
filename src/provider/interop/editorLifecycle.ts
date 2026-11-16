import { z } from 'zod'

import { t } from '../../i18n'

import { copyJson } from './descriptorReader'
import type { ProviderHandle } from './discovery'
import type { HostContext } from './editorActions'
import { invokeEditor } from './editorCapabilityCall'
import { queryAllOpenDocuments } from './editorDocumentQueries'
export { queryAllOpenDocuments } from './editorDocumentQueries'
import type { SessionGrant, SessionGrantStore } from './sessionGrants'
import { type DocumentRef, parseDocumentRef } from './sessionProtocol'

/** Revoke immediately; releasing the matching lease is best effort and never discards edits. */
export async function revokeEditorGrant(
  host: HostContext,
  store: SessionGrantStore,
  grant: SessionGrant,
): Promise<void> {
  if (!store.revoke(grant).length) return
  await host.refresh()
  const found = host.getActiveDiscovered(grant.providerId)
  if (
    !found ||
    found.generation !== grant.generation ||
    found.digest !== grant.digest
  )
    return
  const documents = await queryAllOpenDocuments(
    host,
    [grant.providerId],
    grant.conversationId,
  )
  const document = documents.find(
    (doc) =>
      doc.path === grant.path &&
      doc.sessionId === grant.sessionId &&
      doc.incarnation === grant.incarnation,
  )
  if (document) {
    const {
      providerId: _provider,
      hasView: _view,
      dirty: _dirty,
      heldForAgent: _held,
      ...target
    } = document
    await releaseAgentDocuments(host, [found.handle], grant.conversationId, [
      target,
    ])
  }
}

/** Call only after the person has confirmed discarding this document's AI changes. */
export async function discardAgentDocumentChanges(
  host: HostContext,
  input: DocumentRef,
  providerId: string,
  conversationId: string,
): Promise<{ applied: 'yes'; revisionAfter: number }> {
  const target = parseDocumentRef(input)
  if (host.vaultPath(target.path) !== target.path)
    throw new Error(t('nativeProviderR10.invalidDocumentPath'))
  await host.refresh()
  const raw = await invokeEditor(
    host,
    providerId,
    conversationId,
    'discardAgentChanges',
    { target },
    (editor, caller, signal) =>
      Reflect.apply(editor.discardAgentChanges!, editor.receiver, [
        target,
        { caller, requestId: caller.turnId, signal },
      ]),
  )
  return z
    .object({
      applied: z.literal('yes'),
      revisionAfter: z.number().int().nonnegative(),
    })
    .strict()
    .parse(copyJson(raw, { maxDepth: 2, maxNodes: 10, maxBytes: 1024 }))
}

/** Best-effort bounded cleanup; timeout keeps the provider busy until its promise actually settles. */
export async function releaseAgentDocuments(
  host: HostContext,
  providers: ProviderHandle[],
  conversationId: string,
  documents?: DocumentRef[],
): Promise<void> {
  const targets = documents?.map((item) => parseDocumentRef(item))
  for (const target of targets ?? [])
    if (host.vaultPath(target.path) !== target.path)
      throw new Error(t('nativeProviderR10.invalidDocumentPath'))
  for (const handle of providers) {
    try {
      await invokeEditor(
        host,
        handle.pluginId,
        conversationId,
        'release',
        { documents: targets ?? [] },
        (editor, caller) =>
          Reflect.apply(editor.release!, editor.receiver, [caller, targets]),
      )
    } catch {
      /* Lease cleanup cannot undo user changes; the provider also owns its idle timeout. */
    }
  }
}
