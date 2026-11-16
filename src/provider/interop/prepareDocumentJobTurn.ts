import { isDecompositionMarkdown } from '../../context/documentJobReferences'
import { hostInitiatedPrepare } from '../../core/document-jobs/hostInitiatedPrepare'
import { validDocumentJobs } from '../../core/document-jobs/validJobs'

import { documentJobFileHash } from './documentJobFileHash'
import {
  documentJobFormatSources,
  documentJobSamplePaths,
  emptyDocumentJobPolicy,
} from './documentJobFormatSources'
import { documentJobHost } from './documentJobHost'
import { rememberDocumentJobRequest } from './documentJobRequestContext'
import { finishDocumentJobTurnPolicy } from './documentJobTurnPolicy'
import { documentJobTurnPreparation } from './documentJobTurnPreparation'
import { documentUserRequest } from './exposureTier'
import type { NativeProviderHost } from './NativeProviderHost'
import { pendingDocumentJobs } from './pendingDocumentJobs'
import { preparationTurnPolicy } from './preparationTurnPolicy'
import type { DocumentJobRetryInput } from './retryBlockedDocumentJob'

/** Turn metadata only; this never grants or invokes a write. */
export async function prepareDocumentJobTurn(
  host: NativeProviderHost | undefined,
  input: DocumentJobRetryInput & {
    request: string
    conversationId: string
    currentFile?: { path: string } | null
    mentionables?: readonly unknown[]
    activeSkills?: {
      name?: string
      triggerKeywords?: string[]
      manuallySelected?: boolean
    }[]
    signal?: AbortSignal
    onStart?: () => void
  },
) {
  const empty = emptyDocumentJobPolicy()
  if (!host || typeof host.hostContext !== 'function' || !input.conversationId)
    return {
      active: false,
      fired: false,
      samplePaths: [] as string[],
      formatSources: [] as string[],
      policy: empty,
    }
  const context = host.hostContext(),
    service = documentJobHost(host)
  const request = documentUserRequest(input.request)
  rememberDocumentJobRequest(service, input.conversationId, request)
  const jobs = await validDocumentJobs({
    store: service.store,
    conversationId: input.conversationId,
    hash: (path) => documentJobFileHash(context, context.vaultPath(path)),
    signal: input.signal,
  })
  const policy = await preparationTurnPolicy(service.store, context, input, {
    request,
    activeJob: jobs.length > 0,
    skills: input.activeSkills,
  })
  const paths =
    typeof policy.referencedHwp === 'object' ? [policy.referencedHwp.path] : []
  const result = await hostInitiatedPrepare({
    autoPrepare: policy.autoPrepare,
    baseFontPt: service.currentBaseFontPt(),
    referenceSource: policy.referenceSource,
    conversationId: input.conversationId,
    paths,
    decompositionPaths: paths.filter((path) =>
      isDecompositionMarkdown(context.app, path),
    ),
    jobs,
    hash: (path) => documentJobFileHash(context, context.vaultPath(path)),
    prepare: (sample_path) =>
      service.prepare({ sample_path }, input.conversationId, input.signal),
    signal: input.signal,
    onStart: input.onStart,
  })
  const pending = await pendingDocumentJobs(jobs, service.store, context, input)
  return {
    formatSources: documentJobFormatSources(
      service.store.conversationJobs(input.conversationId),
      pending,
      policy,
      result,
    ),
    pending,
    ...documentJobTurnPreparation(policy, result),
    policy: finishDocumentJobTurnPolicy(
      policy,
      result.result?.state,
      pending.length > 0,
    ),
    samplePaths: documentJobSamplePaths(jobs, result),
  }
}
