import { Download } from 'lucide-react'
import { Modal, Notice, Platform, Setting } from 'obsidian'
import { useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { exportSession } from '../../export/exportSession'
import type { SessionSnapshot } from '../../export/sessionBundle'
import { exportSecrets } from '../../export/sessionBundle'
import { sessionSources } from '../../export/sessionSources'
import { serializeChatMessage } from '../../hooks/useChatHistory'
import { t } from '../../i18n'
import type { AuditTurnRecord, ChatMessage } from '../../types/chat'

export function SessionExportButton(props: {
  conversationId: string
  title: string
  messages: ChatMessage[]
  auditLog: AuditTurnRecord[]
  inProgress: boolean
}) {
  const app = useApp()
  const plugin = usePlugin()
  const { settings } = useSettings()
  const [busy, setBusy] = useState(false)
  const open = () => {
    // Capture the displayed conversation now, including unsaved streamed text.
    const snapshot = JSON.parse(
      JSON.stringify({
        ...props,
        capturedAt: new Date().toISOString(),
        messages: props.messages.map(serializeChatMessage),
      }),
    ) as SessionSnapshot
    const secrets = exportSecrets(settings)
    const modal = new Modal(app)
    modal.titleEl.setText(
      t('ui.SessionExportButton.exportCurrentSessionChatAndLogs'),
    )
    modal.contentEl.createEl('p', {
      text: t('ui.SessionExportButton.savesChatToolResultsRunRecordsAnd'),
    })
    if (props.inProgress)
      modal.contentEl.createEl('p', {
        text: t('ui.SessionExportButton.thisConversationIsRunningChatUpTo'),
      })
    let folder = plugin.settings.lastSessionExportFolder
    new Setting(modal.contentEl)
      .setName(t('ui.SessionExportButton.destinationFolder'))
      .setDesc(t('ui.SessionExportButton.enterTheAbsolutePathOfAnExisting'))
      .addText((text) =>
        text
          .setValue(folder)
          .setPlaceholder('C:\\Exports')
          .onChange((value) => {
            folder = value
          }),
      )
    const status = modal.contentEl.createEl('p')
    new Setting(modal.contentEl)
      .addButton((button) =>
        button
          .setButtonText(t('ui.SessionExportButton.export'))
          .setCta()
          .onClick(async () => {
            if (!plugin.settings.verbex.debug.mode) {
              status.setText(
                t(
                  'ui.SessionExportButton.enableSettingsAdvancedDebugModeToExport',
                ),
              )
              return
            }
            button.setDisabled(true)
            setBusy(true)
            const exportFolder = folder.trim()
            try {
              const destination = await exportSession({
                folder: exportFolder,
                snapshot,
                secrets,
                sources: sessionSources({
                  conversationId: props.conversationId,
                  pluginDir: plugin.manifest.dir,
                  adapter: app.vault.adapter,
                  diagnostics: () =>
                    plugin.nativeProviderHost?.diagnostics.snapshot() ?? null,
                }),
              })
              status.setText(
                t('ui.SessionExportButton.exportComplete', { p0: destination }),
              )
              new Setting(modal.contentEl)
                .setName(t('ui.SessionExportButton.exportedFolder'))
                .addText((text) => {
                  text.setValue(destination)
                  text.inputEl.readOnly = true
                  text.inputEl.setAttribute(
                    'aria-label',
                    t('ui.SessionExportButton.exportedFolderPath'),
                  )
                  text.inputEl.addEventListener('click', () =>
                    text.inputEl.select(),
                  )
                })
                .addButton((copyButton) =>
                  copyButton
                    .setButtonText(t('ui.SessionExportButton.copyPath'))
                    .onClick(async () => {
                      try {
                        await navigator.clipboard.writeText(destination)
                        new Notice(
                          t('ui.SessionExportButton.exportedFolderPathCopied'),
                        )
                      } catch {
                        new Notice(
                          t(
                            'ui.SessionExportButton.couldNotCopyThePathClickThe',
                          ),
                        )
                      }
                    }),
                )
              new Notice(
                t('ui.SessionExportButton.sessionExported', {
                  p0: destination,
                }),
                10000,
              )
              button.setButtonText(t('ui.SessionExportButton.exportComplete2'))
              try {
                await plugin.setSettings({
                  ...plugin.settings,
                  lastSessionExportFolder: exportFolder,
                })
              } catch {
                new Notice(
                  t(
                    'ui.SessionExportButton.exportCompletedButTheSuggestedFolderCould',
                  ),
                )
              }
            } catch {
              status.setText(
                t('ui.SessionExportButton.exportFailedCheckTheFolderPathAnd'),
              )
              button.setDisabled(false)
            } finally {
              setBusy(false)
            }
          }),
      )
      .addButton((button) =>
        button
          .setButtonText(t('ui.SessionExportButton.close'))
          .onClick(() => modal.close()),
      )
    modal.open()
  }
  return (
    <button
      type="button"
      className="clickable-icon"
      aria-label={t('ui.SessionExportButton.exportCurrentSessionChatAndLogs2')}
      title={
        settings.verbex.debug.mode
          ? t('ui.SessionExportButton.exportCurrentSessionChatAndLogs3')
          : t('ui.SessionExportButton.enableSettingsAdvancedDebugModeToExport2')
      }
      disabled={
        !settings.verbex.debug.mode ||
        busy ||
        !Platform.isDesktopApp ||
        !props.messages.length
      }
      onClick={open}
    >
      <Download size={18} />
    </button>
  )
}
