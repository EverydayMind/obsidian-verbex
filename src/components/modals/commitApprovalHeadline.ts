import { t } from '../../i18n'
import type { CommitApprovalRequest } from '../../provider/interop/commitPrepare'

/** What this approval does, in one sentence; file names follow a colon so no particle has to agree with them. */
export function renderCommitHeadline(
  contentEl: HTMLElement,
  request: Pick<
    CommitApprovalRequest,
    'mode' | 'source' | 'destination' | 'template'
  >,
): void {
  const { mode, source, destination, template } = request
  const text =
    mode === 'overwrite'
      ? t('ui.CommitApprovalModal.saveTheWorkingCopyOfToIts', {
          p0: destination,
        })
      : mode === 'save_as'
        ? t('ui.CommitApprovalModal.saveTheWorkingCopyOfToA', {
            p0: destination,
            p1: source ?? '',
          })
        : t('ui.CommitApprovalModal.createANewDocument', {
            p0: destination,
            p1: template
              ? t('ui.CommitApprovalModal.itWillBeACopyOfTemplate', {
                  p0: template,
                })
              : '',
          })
  // The template sentence starts on its own line (see `.verbex-commit-headline`).
  contentEl.createEl('p', { text, cls: 'verbex-commit-headline' })
}

/** A write set that only adds files and folders overwrites nothing. */
export function createsOnly(
  request: Pick<CommitApprovalRequest, 'mode' | 'writeSet'>,
) {
  return (
    request.mode === 'create' &&
    request.writeSet.every(
      (entry) => entry.kind === 'folder' || entry.op === 'create',
    )
  )
}
