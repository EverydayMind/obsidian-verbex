import { documentJobReferences } from '../../context/documentJobReferences'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'

import { documentJobFileHash } from './documentJobFileHash'
import { documentJobTurnPolicy } from './documentJobTurnPolicy'
import type { HostContext } from './editorActions'
import type { prepareDocumentJobTurn } from './prepareDocumentJobTurn'
import { retryBlockedDocumentJob } from './retryBlockedDocumentJob'

export async function preparationTurnPolicy(
  store: DocumentJobStore,
  context: HostContext,
  input: Parameters<typeof prepareDocumentJobTurn>[1],
  turn: Omit<Parameters<typeof documentJobTurnPolicy>[0], 'referencedHwp'>,
) {
  const policy = documentJobTurnPolicy({
    ...turn,
    referencedHwp: documentJobReferences(
      context.app,
      turn.request,
      input.currentFile,
      input.mentionables,
    ),
  })
  return retryBlockedDocumentJob(
    store,
    input.conversationId,
    policy,
    turn.activeJob,
    input,
    (path) => documentJobFileHash(context, context.vaultPath(path)),
    input.signal,
  )
}
