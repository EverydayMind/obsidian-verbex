import React from 'react'

import { t } from '../../i18n'

type PaneErrorBoundaryProps = {
  children: React.ReactNode
}

type PaneErrorBoundaryState = {
  error: Error | null
}

/** Keeps a single failing pane from taking down the rest of the workspace UI. */
export class PaneErrorBoundary extends React.Component<
  PaneErrorBoundaryProps,
  PaneErrorBoundaryState
> {
  state: PaneErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PaneErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Verbex] pane render failed', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="verbex-settings-callout" role="alert">
          {t('views.common.paneError')}
        </div>
      )
    }
    return this.props.children
  }
}
