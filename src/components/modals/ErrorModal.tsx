import { App } from 'obsidian'

import { ReactModal } from '../common/ReactModal'

type ErrorModalOptions = {
  showSettingsButton?: boolean
}

type ErrorModalComponentProps = {
  app: App
  message: string
  log?: string
  onClose: () => void
  options: ErrorModalOptions
}

export class ErrorModal extends ReactModal<ErrorModalComponentProps> {
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
        {options.showSettingsButton && (
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
            Open Settings
          </button>
        )}
        <button className="mod-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
