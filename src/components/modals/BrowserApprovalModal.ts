import { App, Modal } from 'obsidian'

import { t } from '../../i18n'
import type { BrowserApproval } from '../../provider/interop/browserExecution'

import { notifyBrowserApprovalExpired } from './browserApprovalNotice'

type Decision = 'allow' | 'reject' | 'expired'

class BrowserApprovalModal extends Modal {
  private settled = false
  private timer?: ReturnType<typeof setTimeout>
  private readonly expiry: number
  private abort = () => this.finish('reject')
  constructor(
    app: App,
    private request: BrowserApproval,
    private resolve: (decision: Decision) => void,
    private signal?: AbortSignal,
  ) {
    super(app)
    this.expiry = Date.parse(request.expiresAt)
  }
  onOpen(): void {
    const { request } = this
    this.titleEl.setText(t('ui.BrowserApprovalModal.approveOneBrowserAction'))
    this.contentEl.createEl('p', {
      text: `${request.providerName} · ${request.toolTitle}`,
    })
    this.contentEl.createEl('p', {
      text: t('ui.BrowserApprovalModal.checkTheSiteAndOutgoingContentThis'),
    })
    this.contentEl.createEl('h4', {
      text: t('ui.BrowserApprovalModal.actualTargetAndSite'),
    })
    this.contentEl.createEl('pre', {
      text: JSON.stringify(request.target, null, 2),
    })
    this.contentEl.createEl('h4', {
      text: t('ui.BrowserApprovalModal.exactActionAndOutgoingContent'),
    })
    this.contentEl.createEl('pre', {
      text: JSON.stringify(request.args, null, 2),
    })
    this.contentEl.createEl('h4', {
      text: t('ui.BrowserApprovalModal.expectedEffectsPluginDescription'),
    })
    this.contentEl.createEl('pre', {
      text: JSON.stringify(request.card, null, 2),
    })
    const expiry = this.expiry
    const expiryText = this.contentEl.createEl('p')
    const actions = this.contentEl.createDiv({ cls: 'modal-button-container' })
    const allow = actions.createEl('button', {
      text: t('ui.BrowserApprovalModal.allowThisActionOnly'),
      cls: 'mod-cta',
    })
    allow.addEventListener('click', () => this.finish('allow'))
    actions
      .createEl('button', { text: t('ui.BrowserApprovalModal.deny') })
      .addEventListener('click', () => this.finish('reject'))
    if (this.signal?.aborted) this.abort()
    else this.signal?.addEventListener('abort', this.abort, { once: true })
    const update = () => {
      const remainingMs = expiry - Date.now()
      if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
        allow.disabled = true
        this.finish('expired')
        return
      }
      expiryText.setText(
        t('ui.BrowserApprovalModal.approvalExpiresInSeconds', {
          p0: Math.ceil(remainingMs / 1000),
        }),
      )
      this.timer = setTimeout(update, Math.min(1000, remainingMs))
    }
    if (!this.settled) {
      update()
    }
  }
  private finish(decision: Decision): void {
    if (this.settled) return
    if (decision === 'allow') {
      const currentExpiry = Date.parse(this.request.expiresAt)
      if (
        !Number.isFinite(currentExpiry) ||
        currentExpiry !== this.expiry ||
        currentExpiry <= Date.now()
      )
        decision = 'expired'
    }
    this.settled = true
    if (decision === 'expired') notifyBrowserApprovalExpired()
    this.resolve(decision)
    this.close()
  }
  onClose(): void {
    clearTimeout(this.timer)
    this.signal?.removeEventListener('abort', this.abort)
    if (!this.settled) {
      this.settled = true
      this.resolve('reject')
    }
    this.contentEl.empty()
  }
}

export function requestBrowserApproval(
  app: App,
  request: BrowserApproval,
  signal?: AbortSignal,
): Promise<Decision> {
  if (signal?.aborted) return Promise.resolve('reject')
  return new Promise((resolve) =>
    new BrowserApprovalModal(app, request, resolve, signal).open(),
  )
}
