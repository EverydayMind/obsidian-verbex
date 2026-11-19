import { App, Modal } from 'obsidian'

import { t } from '../../i18n'
import type { CommitApprovalRequest } from '../../provider/interop/commitPrepare'
import { pluginLabelWithId } from '../../provider/interop/pluginDisplayName'

import { renderCommitHeadline } from './commitApprovalHeadline'
import {
  commitAllowLabel,
  commitApprovalTitle,
  renderCommitNotesAndInternalWrites,
} from './commitApprovalLists'

type Decision = 'allow' | 'reject'

const size = (bytes?: number) =>
  bytes === undefined ? '' : ` · ${Math.max(1, Math.round(bytes / 1024))}KB`

/** Asks about one provider write of user files. Never remembered: every commit asks again. */
export class CommitApprovalModal extends Modal {
  private settled = false
  private abort = () => this.finish('reject')
  constructor(
    app: App,
    private request: CommitApprovalRequest,
    private resolve: (decision: Decision) => void,
    private signal?: AbortSignal,
  ) {
    super(app)
  }
  onOpen(): void {
    const { request } = this
    this.titleEl.setText(commitApprovalTitle(request.mode))
    renderCommitHeadline(this.contentEl, request)
    this.contentEl.createEl('p', {
      text: t('ui.CommitApprovalModal.requestedToolV', {
        p0: request.toolTitle,
        p1: pluginLabelWithId(
          this.app,
          request.providerId,
          request.providerName,
        ),
        p2: request.pluginVersion,
      }),
    })
    this.contentEl.createEl('p', {
      text: t('ui.CommitApprovalModal.filesAndFoldersToChangeOrCreate'),
    })
    const list = this.contentEl.createEl('ul')
    for (const entry of request.writeSet)
      list.createEl('li', {
        text: `${entry.path} — ${entry.kind === 'folder' ? t('ui.CommitApprovalModal.newFolder') : entry.op === 'create' ? t('ui.CommitApprovalModal.newFile') : t('ui.CommitApprovalModal.overwrite')}${size(entry.sizeBytes)}`,
      })
    renderCommitNotesAndInternalWrites(this.contentEl, request)
    const actions = this.contentEl.createDiv({ cls: 'modal-button-container' })
    actions
      .createEl('button', {
        text: commitAllowLabel(request.mode),
        cls: 'mod-cta',
      })
      .addEventListener('click', () => this.finish('allow'))
    actions
      .createEl('button', { text: t('ui.CommitApprovalModal.deny') })
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

export function requestCommitApproval(
  app: App,
  request: CommitApprovalRequest,
  signal?: AbortSignal,
): Promise<Decision> {
  if (signal?.aborted) return Promise.resolve('reject')
  return new Promise((resolve) =>
    new CommitApprovalModal(app, request, resolve, signal).open(),
  )
}
