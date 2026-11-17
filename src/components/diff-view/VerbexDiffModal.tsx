import { App, Modal } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import { AppProvider } from '../../contexts/app-context'
import { t } from '../../i18n'
import { PermissionDecision } from '../../permissions/PermissionManager'
import { DiffBlock } from '../../utils/chat/diff'
import { ChangeApproval, ProposedChange } from '../../verbex/types'

import { VerbexDiffReview } from './VerbexDiffReview'

/**
 * Hosts VerbexDiffReview and resolves the user's decision as a ChangeApproval.
 * Closing without an explicit decision counts as rejection so a write is never
 * applied by accident.
 */
export class VerbexDiffModal extends Modal {
  private root: Root | null = null
  private resolved = false

  constructor(
    app: App,
    private readonly change: ProposedChange,
    private readonly decision: PermissionDecision,
    private readonly blocks: DiffBlock[],
    private readonly autoModeTimeoutSeconds: number | null,
    private readonly resolve: (approval: ChangeApproval) => void,
  ) {
    super(app)
  }

  onOpen(): void {
    this.titleEl.setText(
      t('ui.VerbexDiffModal.title', { p0: this.change.path }),
    )
    this.root = createRoot(this.contentEl)
    this.root.render(
      <AppProvider app={this.app}>
        <VerbexDiffReview
          change={this.change}
          decision={this.decision}
          blocks={this.blocks}
          autoModeTimeoutSeconds={this.autoModeTimeoutSeconds}
          onResolve={(approval) => this.finish(approval)}
        />
      </AppProvider>,
    )
  }

  private finish(approval: ChangeApproval): void {
    if (this.resolved) return
    this.resolved = true
    this.resolve(approval)
    this.close()
  }

  onClose(): void {
    this.root?.unmount()
    this.root = null
    if (!this.resolved) {
      this.resolved = true
      this.resolve({
        changeId: this.change.id,
        status: 'rejected',
        approvedHunks: [],
        rejectedHunks: [],
        reason: 'Review window closed; change was not applied.',
      })
    }
  }
}
