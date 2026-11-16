import { App, Modal, Setting } from 'obsidian'

import { t } from '../../i18n'

export class DocumentIndexScopeModal extends Modal {
  constructor(
    app: App,
    private enable: (paths: string[]) => Promise<void>,
  ) {
    super(app)
  }
  onOpen() {
    let paths: string[] = []
    this.contentEl.createEl('h2', {
      text: t('ui.DocumentIndexScopeModal.chooseFoldersForDocumentSearch'),
    })
    this.contentEl.createEl('p', {
      text: t('ui.DocumentIndexScopeModal.extractHWPHWPXAndPDFLocallyEnter'),
    })
    new Setting(this.contentEl)
      .setName(t('ui.DocumentIndexScopeModal.includePaths'))
      .addTextArea((input) =>
        input.onChange((value) => {
          paths = value
            .split('\n')
            .map((p) => p.trim())
            .filter(Boolean)
        }),
      )
    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText(t('ui.DocumentIndexScopeModal.enableForSelectedScope'))
          .setCta()
          .onClick(async () => {
            if (!paths.length) return
            await this.enable(paths)
            this.close()
          }),
      )
      .addButton((button) =>
        button
          .setButtonText(t('ui.DocumentIndexScopeModal.cancel'))
          .onClick(() => this.close()),
      )
  }
  onClose() {
    this.contentEl.empty()
  }
}
