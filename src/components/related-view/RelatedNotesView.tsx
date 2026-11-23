import { App } from 'obsidian'
import { useRef } from 'react'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'

import { openRelatedTarget } from './openRelatedTarget'
import { RelatedNotesGraph } from './RelatedNotesGraph'
import { RelatedTextSearch } from './RelatedTextSearch'
import { useActiveNoteRelated } from './useActiveNoteRelated'
import { useRelatedTextSearch } from './useRelatedTextSearch'
import { useResizablePanelHeight } from './useResizablePanelHeight'

type RelatedNotesViewProps = {
  app: App
  plugin: VerbexPlugin
  limit?: number
}

/**
 * Two areas: the graph of the open note on top, and below a separator the
 * search for notes like a typed text. They are kept apart so a search result
 * is not read as part of the graph.
 */
export function RelatedNotesView({
  app,
  plugin,
  limit = 10,
}: RelatedNotesViewProps) {
  const state = useActiveNoteRelated(app, plugin, { limit })
  const textSearch = useRelatedTextSearch(plugin, limit)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const panel = useResizablePanelHeight(app, viewRef)
  const centerPath = state.notesPath ?? state.activePath
  const hasVisibleRelated = state.notes.some(
    (note) => note.path !== centerPath && note.relation !== 'folder_adjacent',
  )

  return (
    <div ref={viewRef} className="verbex-related-view">
      <div className="verbex-related-main">
        <div className="verbex-related-header">
          <div>
            <h2>{t('views.related.title')}</h2>
            <div className="verbex-settings-desc">
              {centerPath ?? t('views.related.openNoteHelp')}
            </div>
          </div>
          <button
            type="button"
            aria-label={t('views.related.refresh')}
            onClick={() => state.refresh({ allowOneShotEmbedding: true })}
            disabled={state.refreshing || !centerPath}
          >
            {state.refreshing
              ? t('views.related.refreshing')
              : t('views.related.refresh')}
          </button>
        </div>

        <label className="verbex-related-filter">
          <input
            type="checkbox"
            checked={state.excludeDailyNotes}
            onChange={(event) =>
              void state.setExcludeDailyNotes(event.target.checked)
            }
          />
          {t('views.related.excludeDailyNotes')}
        </label>

        {centerPath && (
          <div className="verbex-settings-desc verbex-related-hint">
            {t('views.related.ctrlClickHint')}
          </div>
        )}

        {state.error && (
          <div className="verbex-settings-callout" role="alert">
            {state.error}
          </div>
        )}
        {state.loading && (
          <div className="verbex-settings-desc" role="status">
            {t('views.related.finding')}
          </div>
        )}
        {centerPath && (
          <RelatedNotesGraph
            app={app}
            centerPath={centerPath}
            notes={state.notes}
            limit={limit}
            pendingPath={state.pendingPath}
            onShowRelated={state.showRelatedFor}
            onHoldRelated={state.holdRelatedFor}
          />
        )}
        {!state.loading && !hasVisibleRelated && !state.error && (
          <div className="verbex-settings-desc">
            {t('views.related.noNotes')}
          </div>
        )}
      </div>

      <div
        className="verbex-related-splitter"
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('views.related.resizeSearch')}
        aria-valuenow={panel.height}
        tabIndex={0}
        {...panel.separatorProps}
      />

      <section
        className="verbex-related-search-panel"
        style={{ height: panel.height }}
        aria-label={t('views.related.searchTitle')}
      >
        <h3 className="verbex-related-search-title">
          {t('views.related.searchTitle')}
        </h3>
        <div className="verbex-settings-desc verbex-related-search-desc">
          {t('views.related.searchDesc')}
        </div>
        <RelatedTextSearch
          search={textSearch}
          centerPath={centerPath}
          onOpen={(path) => {
            // As a click on a circle: centre the graph on it, then open it in
            // the tab that shows the current centre.
            state.showRelatedFor(path)
            openRelatedTarget(app, path, centerPath ?? undefined)
          }}
        />
      </section>
    </div>
  )
}
