import { App } from 'obsidian'

import { t } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

type ErrorModalOptions = {
  showSettingsButton?: boolean
  /** Primary action that replaces the generic "Open settings" button. */
  action?: { label: string; onClick: () => void }
  onClosed?: () => void
}

type ErrorModalComponentProps = {
  app: App
  message: string
  log?: string
  onClose: () => void
  options: ErrorModalOptions
}

export class ErrorModal extends ReactModal<ErrorModalComponentProps> {
  private onClosed?: () => void

  constructor(
    app: App,
    title: string,
    message: string,
    log?: string,
    options: ErrorModalOptions = {},
  ) {
    super({
      app: app,
      Component: ErrorModalComponent,
      props: {
        app,
        message,
        log,
        options,
      },
      options: {
        title,
      },
    })
    this.onClosed = options.onClosed
  }

  onClose() {
    super.onClose()
    this.onClosed?.()
  }
}

function ErrorModalComponent({
  app,
  message,
  log,
  onClose,
  options,
}: ErrorModalComponentProps) {
  return (
    <div className="verbex-error-modal-content">
      <div className="verbex-error-modal-message">{message}</div>
      {log && <pre className="verbex-error-modal-log">{log}</pre>}
      <div className="modal-button-container">
        {options.action && (
          <button
            className="mod-cta"
            onClick={() => {
              onClose()
              options.action?.onClick()
            }}
          >
            {options.action.label}
          </button>
        )}
        {options.showSettingsButton && !options.action && (
          <button
            className="mod-cta"
            onClick={() => {
              onClose()
              const settingsApp = app as App & {
                setting: { open(): void; openTabById(id: string): void }
              }
              settingsApp.setting.open()
              settingsApp.setting.openTabById('verbex')
            }}
          >
            {t('ui.ErrorModal.openSettings')}
          </button>
        )}
        <button className="mod-cancel" onClick={onClose}>
          {t('ui.InlinePromptModal.cancel')}
        </button>
      </div>
    </div>
  )
}
