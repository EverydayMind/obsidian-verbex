import { App, Modal, Setting } from 'obsidian'

import { t } from '../../i18n'

export type InlinePromptOptions = {
  title: string
  placeholder?: string
  initialValue?: string
  ctaText?: string
}

/**
 * Minimal single-field prompt used by the inline editor commands to collect a
 * short instruction (e.g. "더 간결하게", "공손한 어조로"). Resolves the trimmed
 * value, or null when the user cancels or submits nothing. Cmd/Ctrl+Enter
 * submits; Escape (handled by Obsidian) closes and cancels.
 */
export class InlinePromptModal extends Modal {
  private value: string
  private settled = false

  constructor(
    app: App,
    private readonly options: InlinePromptOptions,
    private readonly resolve: (value: string | null) => void,
  ) {
    super(app)
    this.value = options.initialValue ?? ''
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title)

    const textarea = this.contentEl.createEl('textarea', {
      cls: 'verbex-inline-prompt-input',
    })
    textarea.value = this.value
    textarea.placeholder = this.options.placeholder ?? ''
    textarea.rows = 3
    textarea.addClass('verbex-inline-prompt-textarea')
    textarea.addEventListener('input', () => {
      this.value = textarea.value
    })
    textarea.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        this.submit()
      }
    })

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.options.ctaText ?? t('ui.InlinePromptModal.run'))
          .setCta()
          .onClick(() => this.submit()),
      )
      .addButton((button) =>
        button
          .setButtonText(t('ui.InlinePromptModal.cancel'))
          .onClick(() => this.close()),
      )

    window.setTimeout(() => textarea.focus(), 0)
  }

  private submit(): void {
    const trimmed = this.value.trim()
    this.settle(trimmed.length > 0 ? trimmed : null)
    this.close()
  }

  private settle(value: string | null): void {
    if (this.settled) return
    this.settled = true
    this.resolve(value)
  }

  onClose(): void {
    this.contentEl.empty()
    this.settle(null)
  }
}

/** Promise wrapper around {@link InlinePromptModal}. */
export function promptInline(
  app: App,
  options: InlinePromptOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    new InlinePromptModal(app, options, resolve).open()
  })
}
