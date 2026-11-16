import { App, Modal } from 'obsidian'

import { t } from '../../i18n'
import type { SessionApprovalRequest } from '../../provider/interop/sessionExecution'

type Decision = 'allow' | 'reject'

class SessionEditApprovalModal extends Modal {
  private settled = false
  private abort = () => this.finish('reject')
  constructor(
    app: App,
    private request: SessionApprovalRequest,
    private resolve: (decision: Decision) => void,
    private signal?: AbortSignal,
  ) {
    super(app)
  }
  onOpen(): void {
    const { request } = this
    this.titleEl.setText(
      t('ui.SessionEditApprovalModal.allowDocumentWorkingCopyEdits'),
    )
    this.contentEl.createEl('p', {
      text: t('ui.SessionEditApprovalModal.allowAIToEditTheWorkingCopy', {
        p0: request.path,
      }),
    })
    this.contentEl.createEl('p', {
      text: t('ui.SessionEditApprovalModal.requestedToolV', {
        p0: request.toolTitle,
        p1: request.providerName,
        p2: request.pluginVersion,
      }),
    })
    if (request.visible !== undefined)
      this.contentEl.createEl('p', {
        text: request.visible
          ? t('ui.SessionEditApprovalModal.thisDocumentIsOpenOnScreenEdits')
          : t('ui.SessionEditApprovalModal.thisDocumentIsNotOpenOnScreen'),
        cls: request.visible ? undefined : 'mod-warning',
      })
    this.contentEl.createEl('p', {
      text: t('ui.SessionEditApprovalModal.furtherEditsToThisDocumentInThis'),
    })
    const actions = this.contentEl.createDiv({ cls: 'modal-button-container' })
    actions
      .createEl('button', {
        text: t('ui.SessionEditApprovalModal.allowInThisConversation'),
        cls: 'mod-cta',
      })
      .addEventListener('click', () => this.finish('allow'))
    actions
      .createEl('button', { text: t('ui.SessionEditApprovalModal.deny') })
      .addEventListener('click', () => this.finish('reject'))
    if (this.signal?.aborted) this.abort()
    else this.signal?.addEventListener('abort', this.abort, { once: true })
  }
  private finish(decision: Decision): void {
    if (this.settled) return
    this.settled = true
    this.resolve(decision)
    this.close()
  }
  onClose(): void {
    this.signal?.removeEventListener('abort', this.abort)
    if (!this.settled) {
      this.settled = true
      this.resolve('reject')
    }
    this.contentEl.empty()
  }
}

export function requestSessionEditApproval(
  app: App,
  request: SessionApprovalRequest,
  signal?: AbortSignal,
): Promise<Decision> {
  if (signal?.aborted) return Promise.resolve('reject')
  return new Promise((resolve) =>
    new SessionEditApprovalModal(app, request, resolve, signal).open(),
  )
}
