import { type App, Modal } from 'obsidian'

import { t } from '../../i18n'

/** Resolves only after a choice; Escape, backdrop and close button are cancellations. */
export function confirmDiscardAgentChanges(
  app: App,
  path: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    class DiscardModal extends Modal {
      private confirmed = false
      onOpen() {
        this.titleEl.setText(t('ui.DiscardAgentChangesModal.discardAIChanges'))
        this.contentEl.createEl('p', {
          text: t('ui.DiscardAgentChangesModal.discardTheAIChangesToFromThe', {
            p0: path,
          }),
        })
        const buttons = this.contentEl.createDiv({
          cls: 'modal-button-container',
        })
        buttons.createEl('button', {
          text: t('ui.DiscardAgentChangesModal.cancel'),
        }).onclick = () => this.close()
        buttons.createEl('button', {
          text: t('ui.DiscardAgentChangesModal.discard'),
          cls: 'mod-warning',
        }).onclick = () => {
          this.confirmed = true
          this.close()
        }
      }
      onClose() {
        this.contentEl.empty()
        resolve(this.confirmed)
      }
    }
    new DiscardModal(app).open()
  })
}
