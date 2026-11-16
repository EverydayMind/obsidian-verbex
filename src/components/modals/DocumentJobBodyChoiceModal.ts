import { App, Modal } from 'obsidian'

import { t } from '../../i18n'
import type {
  BodyChoiceRequest,
  BodyChoiceView,
} from '../../provider/interop/hostOptions'

export function bodyChoiceLabel(choice: BodyChoiceView): string {
  const preview = [...choice.preview]
  return t('ui.DocumentJobBodyChoiceModal.paragraphs', {
    p0: choice.prefix
      ? choice.prefix
      : t('ui.DocumentJobBodyChoiceModal.noSymbol'),
    p1: choice.paragraphs,
    p2: preview.slice(0, 80).join(''),
    p3: preview.length > 80 ? '…' : '',
  })
}

class DocumentJobBodyChoiceModal extends Modal {
  private settled = false
  private abort = () => this.finish(null)
  constructor(
    app: App,
    private request: BodyChoiceRequest,
    private resolve: (value: string | null) => void,
    private signal?: AbortSignal,
  ) {
    super(app)
  }
  onOpen(): void {
    this.titleEl.setText(
      t('ui.DocumentJobBodyChoiceModal.chooseBodyFormatting'),
    )
    this.contentEl.createEl('p', {
      text: t(
        'ui.DocumentJobBodyChoiceModal.chooseAParagraphFormatFromTheSample',
      ),
    })
    this.contentEl.createEl('p', { text: this.request.samplePath })
    const list = this.contentEl.createDiv({ cls: 'verbex-body-choice-list' })
    for (const choice of this.request.choices) {
      list
        .createEl('button', {
          text: bodyChoiceLabel(choice),
          cls: 'verbex-body-choice-option',
        })
        .addEventListener('click', () => this.finish(choice.option))
    }
    this.contentEl
      .createDiv({ cls: 'modal-button-container' })
      .createEl('button', { text: t('ui.DocumentJobBodyChoiceModal.skip') })
      .addEventListener('click', () => this.finish(null))
    if (this.signal?.aborted) this.abort()
    else this.signal?.addEventListener('abort', this.abort, { once: true })
  }
  private finish(value: string | null): void {
    if (this.settled) return
    this.settled = true
    this.resolve(value)
    this.close()
  }
  onClose(): void {
    this.signal?.removeEventListener('abort', this.abort)
    if (!this.settled) {
      this.settled = true
      this.resolve(null)
    }
    this.contentEl.empty()
  }
}

export function requestDocumentJobBodyChoice(
  app: App,
  request: BodyChoiceRequest,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return Promise.resolve(null)
  return new Promise((resolve) =>
    new DocumentJobBodyChoiceModal(app, request, resolve, signal).open(),
  )
}
