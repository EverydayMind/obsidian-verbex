import type { DocumentOwner, OwnershipQueryResult } from '../ownershipTypes'

import type { DiagnosticSpan } from './diagnostics'
import type { HostContext } from './editorActions'
import { queryAllOpenDocuments } from './editorDocumentQueries'

/** Preserve the non-strict array API while strict ownership gets structured facts. */
export function hostDocumentQuery(
  context: () => HostContext,
  providerIds: () => string[],
  activeConversations: Set<string>,
) {
  function openDocuments(
    conversationId: string,
    strict: true,
    exceptProviderId?: string,
    trace?: DiagnosticSpan,
  ): Promise<OwnershipQueryResult>
  function openDocuments(
    conversationId: string,
    strict?: false,
    exceptProviderId?: string,
    trace?: DiagnosticSpan,
  ): Promise<DocumentOwner[]>
  async function openDocuments(
    conversationId: string,
    strict = false,
    exceptProviderId?: string,
    trace?: DiagnosticSpan,
  ) {
    if (!strict) activeConversations.add(conversationId)
    const host = context()
    await host.refresh()
    return queryAllOpenDocuments(
      host,
      providerIds().filter((id) => id !== exceptProviderId),
      conversationId,
      strict,
      trace,
    )
  }
  return openDocuments
}
