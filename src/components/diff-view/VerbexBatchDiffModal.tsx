import { App, Modal } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import { AppProvider } from '../../contexts/app-context'
import { t } from '../../i18n'
import { ChangeApproval } from '../../verbex/types'

import { BatchRequest, VerbexBatchDiffReview } from './VerbexBatchDiffReview'

/**
 * Hosts VerbexBatchDiffReview for a multi-file change set. Closing without a
 * decision rejects every change so nothing is applied by accident.
 */
export class VerbexBatchDiffModal extends Modal {
  private root: Root | null = null
  private resolved = false

  constructor(
    app: App,
    private readonly requests: BatchRequest[],
    private readonly resolve: (approvals: ChangeApproval[]) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    this.titleEl.setText(
      t('ui.VerbexBatchDiffModal.title', { p0: this.requests.length }),
    )
    this.root = createRoot(this.contentEl)
    this.root.render(
      <AppProvider app={this.app}>
        <VerbexBatchDiffReview
          requests={this.requests}
          onResolve={(approvals) => this.finish(approvals)}
        />
      </AppProvider>,
    )
  }

  private finish(approvals: ChangeApproval[]): void {
    if (this.resolved) return
    this.resolved = true
    this.resolve(approvals)
    this.close()
  }

  onClose(): void {
    this.root?.unmount()
    this.root = null
    if (!this.resolved) {
      this.resolved = true
      this.resolve(
        this.requests.map((req) => ({
          changeId: req.change.id,
          status: 'rejected' as const,
          approvedHunks: [],
          rejectedHunks: [],
          reason: 'Review window closed; change was not applied.',
        })),
      )
    }
  }
}
