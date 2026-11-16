import { App, TFile } from 'obsidian'

import { t } from '../../../i18n'
import { ReactModal } from '../../common/ReactModal'

type IncludedFilesModalComponentProps = {
  files: TFile[]
  patterns: string[]
}

export class IncludedFilesModal extends ReactModal<IncludedFilesModalComponentProps> {
  constructor(app: App, files: TFile[], patterns: string[]) {
    super({
      app: app,
      Component: IncludedFilesModalComponent,
      props: { files, patterns },
      options: {
        title: t('settings.rag.includedFilesModal.title', {
          count: files.length,
        }),
      },
    })
  }
}

function IncludedFilesModalComponent({
  files,
  patterns,
}: IncludedFilesModalComponentProps) {
  return patterns.length === 0 ? (
    <div>{t('settings.rag.includedFilesModal.noPatterns')}</div>
  ) : files.length === 0 ? (
    <div>{t('settings.rag.includedFilesModal.empty')}</div>
  ) : (
    <ul>
      {files.map((file) => (
        <li key={file.path}>{file.path}</li>
      ))}
    </ul>
  )
}
