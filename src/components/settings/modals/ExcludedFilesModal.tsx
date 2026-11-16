import { App, TFile } from 'obsidian'

import { t } from '../../../i18n'
import { ReactModal } from '../../common/ReactModal'

type ExcludedFilesModalComponentProps = {
  files: TFile[]
}

export class ExcludedFilesModal extends ReactModal<ExcludedFilesModalComponentProps> {
  constructor(app: App, files: TFile[]) {
    super({
      app: app,
      Component: ExcludedFilesModalComponent,
      props: { files },
      options: {
        title: t('settings.rag.excludedFilesModal.title', {
          count: files.length,
        }),
      },
    })
  }
}

function ExcludedFilesModalComponent({
  files,
}: ExcludedFilesModalComponentProps) {
  return files.length === 0 ? (
    <div>{t('settings.rag.excludedFilesModal.empty')}</div>
  ) : (
    <ul>
      {files.map((file) => (
        <li key={file.path}>{file.path}</li>
      ))}
    </ul>
  )
}
