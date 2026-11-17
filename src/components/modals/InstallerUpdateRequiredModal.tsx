import { App } from 'obsidian'

import { t } from '../../i18n'
import { ReactModal } from '../common/ReactModal'

export class InstallerUpdateRequiredModal extends ReactModal<
  Record<string, never>
> {
  constructor(app: App) {
    super({
      app: app,
      Component: InstallerUpdateRequiredModalComponent,
      props: {},
      options: {
        title: t('ui.InstallerUpdateRequiredModal.title'),
      },
    })
  }
}

function InstallerUpdateRequiredModalComponent() {
  return (
    <div>
      <div>{t('ui.InstallerUpdateRequiredModal.description')}</div>
      <div>
        <div className="modal-button-container">
          <button
            className="mod-cta"
            onClick={() => {
              window.open('https://obsidian.md/download')
            }}
          >
            {t('ui.InstallerUpdateRequiredModal.openDownload')}
          </button>
        </div>
      </div>
    </div>
  )
}
