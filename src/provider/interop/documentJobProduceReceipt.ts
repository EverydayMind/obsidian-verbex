import { draftStructure } from '../../core/document-jobs/decompose/draftStructure'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type {
  ProductionKey,
  ReadyData,
} from '../../core/document-jobs/jobTypes'
import { clearPreviewFailure } from '../../core/document-jobs/previewFailure'
import { productionReceipt } from '../../core/document-jobs/productionReceipt'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import { decompositionReceiptFacts } from './decompositionResultFacts'
import type { ConvertedPreview } from './documentJobPreviewSchema'
import type { HostContext } from './editorActions'
import type { InternalCommitFacts } from './hostInternalCommitTypes'
import * as modelText from './residualJobText'
import { verifyProductionRoles } from './verifyProductionRoles'

type Converted = ConvertedPreview

/** Never erase a confirmed mutation if verification or memory bookkeeping fails. */
export async function finalizeDocumentProduction(input: {
  host: HostContext
  store: DocumentJobStore
  facts: InternalCommitFacts
  data: ReadyData
  key: ProductionKey
  sampleSha: string
  preview: Converted
  previousSha256?: string
  draftMarkdown?: string
  context: {
    conversationId: string
    runId: string
    turnId: string
    signal?: AbortSignal
  }
}): Promise<AgentToolOutcome> {
  const { facts, key, context } = input
  const outcome = facts.outcome
  if (
    outcome.status !== 'succeeded' ||
    outcome.mutation !== 'applied' ||
    outcome.commit?.state !== 'written'
  )
    return outcome
  const file = facts.preparation?.writeSet.find(
    (entry) =>
      entry.kind === 'file' &&
      entry.role === 'primary' &&
      entry.path === key.outputPath,
  )
  const fingerprint = facts.preparation?.report.conversionFingerprint
  if (
    !file ||
    file.kind !== 'file' ||
    typeof fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(fingerprint) ||
    !outcome.commit.entries.some(
      (entry) => entry.path === key.outputPath && entry.state === 'written',
    )
  )
    return {
      ...outcome,
      status: 'paused',
      terminal: true,
      retry: { allowed: false },
      displayText: modelText.productionReceiptUnverified(),
    }
  const verification = await verifyProductionRoles({
    host: input.host,
    data: input.data,
    facts,
    path: key.outputPath,
    runId: context.runId,
    turnId: context.turnId,
    signal: context.signal,
  })
  let receipt
  try {
    receipt = productionReceipt({
      data: input.data,
      outputPath: key.outputPath,
      sha256: file.sha256Expected,
      preview: input.preview,
      commitFingerprint: fingerprint,
      verification,
      previousSha256: input.previousSha256,
    })
  } catch {
    receipt = productionReceipt({
      data: input.data,
      outputPath: key.outputPath,
      sha256: file.sha256Expected,
      preview: input.preview,
      commitFingerprint: fingerprint,
      verification: {
        verification: {
          state: 'unavailable',
          reason: 'verification_unavailable',
        },
      },
      previousSha256: input.previousSha256,
    })
  }
  Object.assign(
    receipt,
    draftStructure(
      input.draftMarkdown ?? '',
      input.data.draftContract,
      input.data.rolePrefixes,
    ),
  )
  try {
    input.store.recordProduced(
      context.conversationId,
      input.sampleSha,
      key,
      file.sha256Expected,
      receipt,
    )
    clearPreviewFailure(input.store, key.jobId)
  } catch {
    /* An expired job must not erase a confirmed write. */
  }
  return {
    ...outcome,
    displayText: JSON.stringify(receipt),
    documentJobReceipt: {
      jobId: key.jobId,
      outputPath: key.outputPath,
      sha256: file.sha256Expected,
      verification:
        receipt.verification &&
        typeof receipt.verification === 'object' &&
        !Array.isArray(receipt.verification) &&
        receipt.verification.state === 'complete'
          ? 'complete'
          : 'unavailable',
      previewMismatch: receipt.previewMismatch === true,
      ...decompositionReceiptFacts(input.data),
    },
  }
}
