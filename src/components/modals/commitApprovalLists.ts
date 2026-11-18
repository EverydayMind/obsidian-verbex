import { t } from '../../i18n'
import type { CommitApprovalRequest } from '../../provider/interop/commitPrepare'

function addList(parent: HTMLElement, items: readonly string[]): void {
  const ul = parent.createEl('ul')
  for (const item of items) ul.createEl('li', { text: item })
}

export function renderCommitNotesAndInternalWrites(
  contentEl: HTMLElement,
  request: Pick<CommitApprovalRequest, 'notes' | 'internalWrites'>,
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
}
