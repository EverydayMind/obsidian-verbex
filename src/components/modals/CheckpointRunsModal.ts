import { App, Modal, Notice } from 'obsidian'

import type { RestorableRun } from '../../checkpoint/checkpointRuns'
import type { ChatManager } from '../../database/json/chat/ChatManager'
import { t } from '../../i18n'
import type { VerbexController } from '../../VerbexController'

import { checkpointPaths, checkpointSummary } from './checkpointRunLabels'

export class CheckpointRunsModal extends Modal {
  private generation = 0
  private restoring = false
  private closed = false

  constructor(
    app: App,
    private controller: VerbexController,
    private chats: ChatManager,
  ) {
    super(app)
  }

  onOpen(): void {
    this.closed = false
    this.titleEl.setText(t('ui.checkpointRuns.title'))
    void this.load()
  }

  onClose(): void {
    this.closed = true
    this.generation++
    this.contentEl.empty()
  }

  private async title(runId: string): Promise<string> {
    try {
      const title = runId.startsWith('chat-')
        ? (await this.chats.findById(runId.slice(5)))?.title
        : await this.controller.runLifecycle.getRunTitle(runId)
      return title?.trim() ? title.trim() : runId
    } catch {
      return runId
    }
  }

  private async load(): Promise<void> {
    const generation = ++this.generation
    this.contentEl.empty()
    this.contentEl.createEl('p', { text: t('ui.checkpointRuns.loading') })
    try {
      const dispatcher = this.controller.runLifecycle.dispatcher
      if (!dispatcher) throw new Error('Checkpoint dispatcher is not ready')
      const runs = await dispatcher.listRestorableRuns()
      const titles = await Promise.all(runs.map((run) => this.title(run.runId)))
      if (generation !== this.generation) return
      this.contentEl.empty()
      this.contentEl.createEl('p', {
        text: t('ui.checkpointRuns.description', { p0: 30 }),
      })
      if (!runs.length)
        this.contentEl.createEl('p', { text: t('ui.checkpointRuns.empty') })
      runs.forEach((run, index) => {
        const row = this.contentEl.createDiv()
        row.createEl('h3', { text: titles[index] })
        row.createEl('p', {
          text: new Date(run.lastChangedAt).toLocaleString(),
        })
        row.createEl('p', {
          text: checkpointSummary(run.checkpointCount, run.paths.length),
        })
        row.createEl('p', { text: checkpointPaths(run.paths) })
        row
          .createEl('button', { text: t('ui.checkpointRuns.restore') })
          .addEventListener('click', () => {
            if (this.busy()) return
            this.confirm(run, titles[index])
          })
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.contentEl.empty()
      this.contentEl.createEl('p', {
        text: t('ui.checkpointRuns.error', { p0: String(error) }),
      })
    }
  }

  private busy(): boolean {
    if (!this.restoring && !this.controller.mutationWorkInProgress) return false
    new Notice(t('ui.checkpointRuns.busy'))
    return true
  }

  private confirm(run: RestorableRun, title: string): void {
    this.contentEl.empty()
    this.contentEl.createEl('h3', { text: title })
    this.contentEl.createEl('p', { text: t('ui.checkpointRuns.confirm') })
    const list = this.contentEl.createEl('ul', {
      cls: 'verbex-checkpoint-paths',
    })
    for (const path of run.paths) list.createEl('li', { text: path })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    buttons
      .createEl('button', {
        text: t('ui.checkpointRuns.restore'),
        cls: 'mod-warning',
      })
      .addEventListener('click', () => {
        if (!this.busy()) void this.restore(run.runId)
      })
    buttons
      .createEl('button', { text: t('ui.checkpointRuns.cancel') })
      .addEventListener('click', () => void this.load())
  }

  private async restore(runId: string): Promise<void> {
    this.restoring = true
    try {
      const result = await this.controller.rollbackRun(runId)
      const report = result?.report
      if (!report) {
        new Notice(t('ui.checkpointRuns.empty'))
      } else {
        const paths = [...report.skipped, ...report.failed].map(
          (item) => item.path,
        )
        const message = t('ui.checkpointRuns.result', {
          p0: report.restored.length,
          p1: report.skipped.length,
          p2: report.failed.length,
        })
        new Notice(
          paths.length ? `${message}: ${paths.join(', ')}` : message,
          paths.length ? 0 : undefined,
        )
      }
    } catch (error) {
      new Notice(t('ui.checkpointRuns.error', { p0: String(error) }), 0)
    } finally {
      this.restoring = false
      if (!this.closed) await this.load()
    }
  }
}
