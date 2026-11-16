import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import { PaneErrorBoundary } from './components/common/PaneErrorBoundary'
import { StatusViewRoot } from './components/status-view/StatusViewRoot'
import { STATUS_VIEW_TYPE } from './constants'
import VerbexPlugin from './main'

export class VerbexStatusView extends ItemView {
  private root: Root | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: VerbexPlugin,
  ) {
    super(leaf)
  }

  getViewType() {
    return STATUS_VIEW_TYPE
  }

  getIcon() {
    return 'list-checks'
  }

  getDisplayText() {
    return 'Verbex status'
  }

  onOpen(): Promise<void> {
    if (!this.root) {
      this.root = createRoot(this.containerEl.children[1])
    }
    this.root.render(
      <React.StrictMode>
        <PaneErrorBoundary>
          <StatusViewRoot
            controller={this.plugin.verbexController}
            plugin={this.plugin}
          />
        </PaneErrorBoundary>
      </React.StrictMode>,
    )
    // A workspace-restored status view must not wait for deferred plugin
    // initialization. Obsidian waits for a custom view's onOpen() while it
    // restores the workspace, and plugin.whenReady resolves only after that
    // initialization completes. Explicit opening and the Refresh button
    // retain the eager path through VerbexPlugin.openStatusView().
    void this.plugin.whenReady
      .then(() => {
        if (!this.root) return
        return this.plugin.verbexController.refresh({
          embeddingStats: 'eager',
        })
      })
      .catch((error: unknown) => {
        console.error(
          'Failed to refresh restored Verbex status view:',
          error instanceof Error ? error.message : String(error),
        )
      })
    return Promise.resolve()
  }

  async onClose() {
    this.root?.unmount()
    this.root = null
  }
}
