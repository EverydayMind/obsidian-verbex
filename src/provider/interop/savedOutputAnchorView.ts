import type { CommitRuntime } from './commitPrepare'
import type { CommitFact } from './commitStatus'
import type { OutputAnchorCapture } from './outputAnchorCapture'

/** Historical observation only; does not claim that the file is still unchanged. */
export async function savedOutputAnchorView(
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
) {
  return boundAnchorView(
    runtime,
    capture,
    fact,
    conversationId,
    (preparationId) =>
      capture?.snapshot(conversationId, fact.runId, preparationId),
  )
}

/** Only a live host-owned lease can view this invocation's observation. */
export async function savedOutputAnchorLeaseView(
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
  leaseId: string,
) {
  return boundAnchorView(
    runtime,
    capture,
    fact,
    conversationId,
    (preparationId) => {
      if (!capture?.leaseCurrent(leaseId, conversationId, fact.runId))
        return undefined
      return capture.snapshotLease(leaseId, preparationId)
    },
  )
}

async function boundAnchorView(
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
  getSnapshot: (
    preparationId: string,
  ) => ReturnType<OutputAnchorCapture['snapshot']>,
) {
  if (!runtime || !capture || fact.providerId !== 'md-to-hwpx') return undefined
  for (const id of [fact.runId, fact.checkpointId])
    if (
      typeof id !== 'string' ||
      !/^[\w.:-]{1,256}$/.test(id) ||
      id.includes('..')
    )
      return undefined
  const record = await runtime.checkpoints.read(fact.runId, fact.checkpointId)
  if (
    !record ||
    record.id !== fact.checkpointId ||
    record.runId !== fact.runId ||
    record.conversationId !== conversationId ||
    record.providerId !== 'md-to-hwpx' ||
    record.tool !== 'export_note' ||
    record.state !== 'written' ||
    record.unexpectedChanges ||
    record.destination !== fact.destination ||
    record.entries.some((entry) => entry.restore)
  )
    return undefined
  const primary = record.entries.find(
    (entry) =>
      entry.kind === 'file' &&
      entry.role === 'primary' &&
      entry.path === record.destination,
  )
  if (
    !primary ||
    primary.kind !== 'file' ||
    primary.state !== 'written' ||
    primary.afterHash !== primary.expectedHash
  )
    return undefined
  const snapshot = getSnapshot(record.preparationId)
  const pages = snapshot?.pages
  if (
    !pages?.length ||
    pages.some(
      (page) =>
        page.preparationId !== record.preparationId ||
        page.preparationDigest !== record.preparationDigest ||
        page.destination !== record.destination ||
        page.archiveSha256 !== primary.expectedHash,
    )
  )
    return undefined
  return snapshot
}
