import { App, Modal } from 'obsidian'

import type { TextRollbackApproval } from '../../checkpoint/TextRollbackGuard'
import { t } from '../../i18n'

class TextRollbackApprovalModal extends Modal {
  private accepted = false
  constructor(
    app: App,
    private request: TextRollbackApproval,
    private resolve: (allow: boolean) => void,
  ) {
    super(app)
  }
  onOpen(): void {
    this.titleEl.setText(
      t('ui.TextRollbackApprovalModal.approveTextFileRestoration'),
    )
    this.contentEl.createEl('p', {
      text: t(
        'ui.TextRollbackApprovalModal.restoreTheCurrentContentsOfTheFollowing',
      ),
    })
    this.contentEl.createEl('p', {
      text: t('ui.TextRollbackApprovalModal.runCheckpoint', {
        p0: this.request.runId,
        p1: this.request.checkpointId,
      }),
    })
    const list = this.contentEl.createEl('ul')
    for (const entry of this.request.paths)
      list.createEl('li', {
        text: `${entry.path} — ${entry.restoreHash === null ? t('ui.TextRollbackApprovalModal.deleteCurrentFile') : entry.currentHash === null ? t('ui.TextRollbackApprovalModal.recreatePreviousContents') : t('ui.TextRollbackApprovalModal.overwriteWithPreviousContents')}${entry.changedAfterApply === true ? t('ui.TextRollbackApprovalModal.changedAfterApplying') : entry.changedAfterApply === undefined ? t('ui.TextRollbackApprovalModal.changesAfterApplyingNotConfirmed') : ''}`,
      })
    this.contentEl.createEl('p', {
      text: t(
        'ui.TextRollbackApprovalModal.filesChangedWhileApprovalIsPendingWill',
      ),
    })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    buttons
      .createEl('button', {
        text: t('ui.TextRollbackApprovalModal.allowThisRestoration'),
        cls: 'mod-warning',
      })
      .addEventListener('click', () => {
        this.accepted = true
        this.close()
      })
    buttons
      .createEl('button', { text: t('ui.TextRollbackApprovalModal.skip') })
      .addEventListener('click', () => this.close())
  }
  onClose(): void {
    this.resolve(this.accepted)
    this.contentEl.empty()
  }
}

export function requestTextRollbackApproval(
  app: App,
  request: TextRollbackApproval,
): Promise<boolean> {
  return new Promise((resolve) =>
    new TextRollbackApprovalModal(app, request, resolve).open(),
  )
}
