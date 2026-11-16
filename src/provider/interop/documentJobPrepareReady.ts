import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { requestedDecomposition } from './documentJobRequestContext'

export function recordPreparedDecomposition(
  owner: object,
  store: DocumentJobStore,
  ready: FormatJob,
  conversationId: string,
): void {
  if (ready.status.state !== 'ready' || !ready.status.data.decomposition) return
  ready.status.data.decomposition.explicit = requestedDecomposition(
    owner,
    conversationId,
  )
  store.transition(ready.id, conversationId, ready.sampleSha256, {
    state: 'ready',
    data: ready.status.data,
  })
}
