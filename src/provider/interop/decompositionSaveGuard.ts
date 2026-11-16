import type { Decomposition } from '../../core/document-jobs/decompose/jobDecomposition'

import type { CommitPreparation } from './commitProtocol'
import { probeOutputPath } from './documentOutputPath'
import type { HostContext } from './editorActions'
import { HostCommitNotStarted } from './hostInternalCommitTypes'

type Pending = NonNullable<Decomposition['pending']>
export async function decompositionPathsFree(
  host: HostContext,
  pending: Pending,
): Promise<boolean> {
  for (const path of [pending.templatePath, pending.textPath]) {
    const probe = await probeOutputPath(host.app, path)
    if (probe.kind === 'occupied') return false
    if (probe.kind !== 'free') throw new HostCommitNotStarted('path_unreadable')
  }
  return true
}
/** This guard is deliberately independent of the single-output produce guard. */
export function assertDecompositionWriteSet(
  preparation: CommitPreparation,
  pending: Pending,
): void {
  const files = preparation.writeSet.filter((e) => e.kind === 'file')
  if (
    preparation.mode !== 'create' ||
    preparation.destination !== pending.templatePath ||
    files.length !== 2 ||
    files.some((e) => e.op !== 'create' || e.sha256Before !== null) ||
    !files.some(
      (e) => e.path === pending.templatePath && e.role === 'primary',
    ) ||
    !files.some(
      (e) =>
        e.path === pending.textPath &&
        e.role === 'derived' &&
        e.sha256Expected === pending.markdownSha256,
    ) ||
    preparation.writeSet.some(
      (e) =>
        e.kind === 'folder' &&
        (!pending.templatePath.startsWith(e.path + '/') ||
          !pending.textPath.startsWith(e.path + '/')),
    ) ||
    preparation.report.decompositionId !== pending.record.decompositionId ||
    preparation.report.textSha256 !== pending.markdownSha256 ||
    preparation.report.conversionFingerprint !== pending.conversionFingerprint
  )
    throw new HostCommitNotStarted('invalid_decomposition_write_set')
}
