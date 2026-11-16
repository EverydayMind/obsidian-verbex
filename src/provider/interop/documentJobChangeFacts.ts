import { skipDecompositionSave } from '../../core/document-jobs/decompose/skippedSave'
import { validDocumentJobs } from '../../core/document-jobs/validJobs'
import type { LocalChangeFactProvider } from '../../core/tools/applyLocalChange'

import { scopedNextStep } from './documentJobExplicitScope'
import { documentJobHost } from './documentJobHost'
import type { NativeProviderHost } from './NativeProviderHost'

/** Registration belongs to document jobs; the local mutation tail knows only a text port. */
export function documentJobChangeFacts(
  host?: NativeProviderHost,
  trigger?: 'explicit' | 'structural',
  explicitJobIds?: readonly string[],
): LocalChangeFactProvider {
  return async (input) => {
    const { status, changedPath, conversationId, signal } = input
    if (status !== 'applied' || !changedPath || !conversationId || !host) return
    const context = host.hostContext(),
      service = documentJobHost(host)
    const path = context.vaultPath(changedPath)
    const jobs = await validDocumentJobs({
      store: service.store,
      conversationId,
      hash: (sample) => service.byteHash(sample),
      signal,
    })
    const job = jobs.find(
      (candidate) =>
        candidate.status.state === 'ready' &&
        context.vaultPath(candidate.status.data.draftPath) === path &&
        !service.store.hasProduction(candidate.id),
    )
    if (!job) return
    skipDecompositionSave(service.store, job)
    return scopedNextStep(job, trigger, explicitJobIds, input.observation)
  }
}
