import { App } from 'obsidian'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'

import { RelatedNotesGraph } from './RelatedNotesGraph'
import { useActiveNoteRelated } from './useActiveNoteRelated'

type RelatedNotesViewProps = {
  app: App
  plugin: VerbexPlugin
  limit?: number
}

export function RelatedNotesView({
  app,
  plugin,
  limit = 10,
}: RelatedNotesViewProps) {
  const state = useActiveNoteRelated(app, plugin, { limit })
  const centerPath = state.notesPath ?? state.activePath
  const hasVisibleRelated = state.notes.some(
    (note) => note.path !== centerPath && note.relation !== 'folder_adjacent',
  )

  return (
    <div className="verbex-related-view">
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
        <div className="verbex-settings-desc">{t('views.related.noNotes')}</div>
      )}
    </div>
  )
}
