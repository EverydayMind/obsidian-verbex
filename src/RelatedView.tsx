import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import { PaneErrorBoundary } from './components/common/PaneErrorBoundary'
import { RelatedNotesView } from './components/related-view/RelatedNotesView'
import { RELATED_VIEW_TYPE } from './constants'
import { VERBEX_RELATED_ICON } from './icons'
import VerbexPlugin from './main'

export const RELATED_NOTES_MAX_COUNT = 10

export class VerbexRelatedNotesView extends ItemView {
  private root: Root | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: VerbexPlugin,
  ) {
    super(leaf)
  }

  getViewType() {
    return RELATED_VIEW_TYPE
  }

  getIcon() {
    return VERBEX_RELATED_ICON
  }

  getDisplayText() {
    return 'Related Notes'
  }

  onOpen(): Promise<void> {
    if (!this.root) {
      this.root = createRoot(this.containerEl.children[1])
    }
    this.root.render(
      <React.StrictMode>
        <PaneErrorBoundary>
          <RelatedNotesView
            app={this.app}
            plugin={this.plugin}
            limit={RELATED_NOTES_MAX_COUNT}
          />
        </PaneErrorBoundary>
      </React.StrictMode>,
    )
    return Promise.resolve()
  }

  async onClose() {
    this.root?.unmount()
    this.root = null
  }
}
