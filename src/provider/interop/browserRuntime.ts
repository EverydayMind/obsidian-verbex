import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'

import { App, Modal, Notice } from 'obsidian'

import { requestBrowserApproval } from '../../components/modals/BrowserApprovalModal'
import { t } from '../../i18n'

import type { BrowserRuntime } from './browserExecution'
import { type BrowserOperation, BrowserOperations } from './browserOperations'
import type { BrowserStatus } from './browserStatus'
import { describeBrowserStatus } from './browserStatusText'

/** Desktop only. Atomic replacement of the plugin's minimal internal journal. */
export function createBrowserRuntime(
  app: App,
  pluginDir?: string,
): BrowserRuntime | undefined {
  const adapter = app.vault.adapter as unknown as { getBasePath?: () => string }
  if (!adapter.getBasePath || !pluginDir) return undefined
  const root = path.resolve(adapter.getBasePath(), pluginDir)
  const file = path.join(root, 'browser-operations.json')
  const operations = new BrowserOperations({
    read: async () => {
      try {
        return JSON.parse(await fs.readFile(file, 'utf8')) as unknown
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
    },
    write: async (records) => {
      const temporary = path.join(
        root,
        `.browser-operations-${randomUUID()}.tmp`,
      )
      try {
        const handle = await fs.open(temporary, 'wx')
        try {
          await handle.writeFile(JSON.stringify(records), 'utf8')
          await handle.sync()
        } finally {
          await handle.close()
        }
        await fs.rename(temporary, file)
      } finally {
        await fs.unlink(temporary).catch(() => undefined)
      }
    },
  })
  return {
    operations,
    approve: (request, signal) => requestBrowserApproval(app, request, signal),
    notifyExpired: () => {
      new Notice(
        t('ui.browserRuntime.browserActionApprovalExpiredTheActionWas'),
      )
    },
  }
}

/** A human can clear the safety stop after checking the site; this asserts no remote success. */
export async function reviewBrowserOperations(
  app: App,
  runtime?: BrowserRuntime,
  queryStatus?: (record: BrowserOperation) => Promise<BrowserStatus>,
): Promise<void> {
  if (!runtime) return
  const records = await runtime.operations.unresolved()
  const modal = new Modal(app)
  modal.titleEl.setText(t('ui.browserRuntime.checkUnresolvedBrowserActions'))
  modal.contentEl.createEl('p', {
    text: t('ui.browserRuntime.checkTheActionResultOnTheSite'),
  })
  for (const record of records) {
    const row = modal.contentEl.createDiv()
    row.createEl('p', { text: `${record.providerId} · ${record.operationId}` })
    if (queryStatus) {
      const statusButton = row.createEl('button', {
        text: t('ui.browserRuntime.refreshProviderStatus'),
      })
      const statusText = row.createEl('p')
      const show = async () => {
        statusButton.disabled = true
        statusText.setText(t('ui.browserRuntime.checkingProviderStatus'))
        try {
          statusText.setText(describeBrowserStatus(await queryStatus(record)))
        } catch {
          statusText.setText(
            t('ui.browserRuntime.couldNotCheckStatusCheckTheSite'),
          )
        } finally {
          statusButton.disabled = false
        }
      }
      statusButton.addEventListener('click', () => void show())
      // Passive read on open so a zero-input pre-dispatch rejection is visible without a click.
      if (record.state !== 'pending') void show()
    }
    const button = row.createEl('button', {
      text: t('ui.browserRuntime.iCheckedTheSiteUnblock'),
    })
    button.disabled = record.state === 'pending'
    button.addEventListener('click', () => {
      void (async () => {
        try {
          button.disabled = true
          await runtime.operations.acknowledge(record.operationId)
          row.remove()
        } catch {
          row.createEl('p', {
            text: t('ui.browserRuntime.thisActionIsRunningOrHasAlready'),
          })
        }
      })()
    })
    if (record.state === 'pending')
      row.createEl('p', {
        text: t('ui.browserRuntime.waitingForTheActionResponseItCannot'),
      })
  }
  if (!records.length)
    modal.contentEl.createEl('p', {
      text: t('ui.browserRuntime.noUnresolvedActions'),
    })
  modal.open()
}
