import { App, Modal } from 'obsidian'

import { t } from '../../i18n'
import type {
  McpApprovalDecision,
  McpApprovalRequest,
} from '../../provider/mcp/McpToolAdapter'

class McpApprovalModal extends Modal {
  private settled = false
  private abort = () => this.finish('reject')
  constructor(
    app: App,
    private request: McpApprovalRequest,
    private resolve: (decision: McpApprovalDecision) => void,
    private signal?: AbortSignal,
  ) {
    super(app)
  }
  onOpen(): void {
    this.titleEl.setText(
      this.request.mode === 'call'
        ? t('ui.McpApprovalModal.approveMCPCall')
        : t('ui.McpApprovalModal.confirmAutomaticMCPApproval'),
    )
    const { entry, args } = this.request
    this.contentEl.createEl('p', {
      text: `${entry.tool.title ?? entry.tool.name} · ${entry.serverName}`,
    })
    this.contentEl.createEl('p', { text: entry.tool.description ?? '' })
    this.contentEl.createEl('p', {
      text: t('ui.McpApprovalModal.thisToolSendsArgumentsToAnExternal'),
    })
    if (args) {
      this.contentEl.createEl('p', {
        text: t('ui.McpApprovalModal.argumentsToSend'),
      })
      this.contentEl.createEl('pre', { text: JSON.stringify(args, null, 2) })
    }
    const advanced = this.contentEl.createEl('details')
    advanced.createEl('summary', {
      text: t('ui.McpApprovalModal.reviewToolDefinition'),
    })
    advanced.createEl('pre', {
      text: JSON.stringify(entry.tool.inputSchema, null, 2),
    })
    this.contentEl.createEl('p', {
      text: t(
        'ui.McpApprovalModal.automaticApprovalAppliesToAllFutureArguments',
      ),
    })
    const actions = this.contentEl.createDiv({ cls: 'modal-button-container' })
    if (this.request.mode === 'call')
      actions
        .createEl('button', { text: t('ui.McpApprovalModal.allowThisCall') })
        .addEventListener('click', () => this.finish('once'))
    actions
      .createEl('button', {
        text: t('ui.McpApprovalModal.automaticallyAllowThisTool'),
        cls: 'mod-warning',
      })
      .addEventListener('click', () => this.finish('automatic'))
    actions
      .createEl('button', { text: t('ui.McpApprovalModal.deny') })
      .addEventListener('click', () => this.finish('reject'))
    if (this.signal?.aborted) this.abort()
    else this.signal?.addEventListener('abort', this.abort, { once: true })
  }
  private finish(decision: McpApprovalDecision): void {
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
export function requestMcpApproval(
  app: App,
  request: McpApprovalRequest,
  signal?: AbortSignal,
): Promise<McpApprovalDecision> {
  if (signal?.aborted) return Promise.resolve('reject')
  return new Promise((resolve) =>
    new McpApprovalModal(app, request, resolve, signal).open(),
  )
}
