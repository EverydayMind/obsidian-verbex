import { explicitDecomposition } from '../../core/document-jobs/decompose/fitness'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'

const requests = new WeakMap<object, Map<string, boolean>>()
/** Submitted user intent stays host-owned and out of the model tool arguments. */
export function rememberDocumentJobRequest(
  service: object,
  conversationId: string,
  request: string,
): void {
  let conversations = requests.get(service)
  if (!conversations)
    requests.set(service, (conversations = new Map<string, boolean>()))
  const explicit = explicitDecomposition(request)
  conversations.set(conversationId, explicit)
  const store = (service as { store?: DocumentJobStore }).store
  for (const job of store?.activeJobs(conversationId) ?? []) {
    if (job.status.state !== 'ready' || !job.status.data.decomposition) continue
    job.status.data.decomposition.explicit = explicit
    store?.transition(job.id, conversationId, job.sampleSha256, job.status)
  }
  if (conversations.size > 128)
    conversations.delete(conversations.keys().next().value as string)
}
export function requestedDecomposition(
  service: object,
  conversationId: string,
): boolean {
  return requests.get(service)?.get(conversationId) === true
}
