import { t } from '../../i18n'
import type { CommitApprovalRequest } from '../../provider/interop/commitPrepare'

import { createsOnly } from './commitApprovalHeadline'

type Mode = CommitApprovalRequest['mode']

/** Title and primary button share one verb; read at open time so they follow the UI language. */
export function commitApprovalTitle(mode: Mode): string {
  return mode === 'overwrite'
    ? t('ui.CommitApprovalModal.approveDocumentSave')
    : mode === 'save_as'
      ? t('ui.CommitApprovalModal.approveSaveAs')
      : t('ui.CommitApprovalModal.approveNewDocument')
}

export function commitAllowLabel(mode: Mode): string {
  return mode === 'create'
    ? t('ui.CommitApprovalModal.allowCreating')
    : t('ui.CommitApprovalModal.allowThisSave')
}

function addList(parent: HTMLElement, items: readonly string[]): void {
  const ul = parent.createEl('ul')
  for (const item of items) ul.createEl('li', { text: item })
}

export function renderCommitNotesAndInternalWrites(
  contentEl: HTMLElement,
  request: Pick<
    CommitApprovalRequest,
    'mode' | 'writeSet' | 'notes' | 'internalWrites'
  >,
): void {
  if (request.notes.length) {
    contentEl.createEl('p', {
      text: t('ui.CommitApprovalModal.pluginNotes'),
    })
    addList(contentEl, request.notes)
  }
  if (request.internalWrites.length) {
    const details = contentEl.createEl('details')
    details.createEl('summary', {
      text: t('ui.CommitApprovalModal.temporaryWorkingFiles', {
        count: request.internalWrites.length,
      }),
    })
    addList(details, request.internalWrites)
  }
  // Names the command exactly as the command palette lists it.
  contentEl.createEl('p', {
    text: t(
      createsOnly(request)
        ? 'ui.CommitApprovalModal.newFilesOnly'
        : 'ui.CommitApprovalModal.beforeWritingTheCurrentContentsOfThese',
      { command: t('restoreActiveRunCommand') },
    ),
  })
}
