import { App } from 'obsidian'
import { useEffect, useState } from 'react'

import {
  type RelatedNote,
  type RelatedNoteSignal,
} from '../../core/rag/relatedNotes'
import { t } from '../../i18n'
import VerbexPlugin from '../../main'
import { openMarkdownFile } from '../../utils/obsidian'
import {
  type SourceCitation,
  createSourceCitation,
  openSourceCitation,
} from '../../utils/sourceCitation'

import { useActiveNoteRelated } from './useActiveNoteRelated'

type RelatedNotesViewProps = {
  app: App
  plugin: VerbexPlugin
  limit?: number
}

function RelatedNoteItem({ app, note }: { app: App; note: RelatedNote }) {
  const [location, setLocation] = useState<{
    citation: SourceCitation
    heading?: string
  } | null>(null)
  useEffect(() => {
    let cancelled = false
    setLocation(null)
    const findLocation = async () => {
      if (!note.startLine || !note.endLine || !/\.md$/i.test(note.path)) return
      const file = app.vault.getFileByPath(note.path)
      if (!file) return
      const citation = await createSourceCitation(
        note.path,
        await app.vault.cachedRead(file),
        note.startLine,
        note.endLine,
        note.snippet,
        true,
      )
      if (!citation || cancelled) return
      const headings = app.metadataCache.getFileCache(file)?.headings ?? []
      const heading = headings
        .filter((h) => h.position.start.line < citation.startLine)
        .pop()?.heading
      setLocation({ citation, heading })
    }
    void findLocation().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [app, note.path, note.startLine, note.endLine, note.snippet])
  const signalLabel = (signal: RelatedNoteSignal) =>
    t(`views.related.signals.${signal}`)

  return (
    <div>
      <button
        type="button"
        className="verbex-related-note"
        data-category={note.category}
        onClick={(event) => {
          const newTab = event.metaKey || event.ctrlKey
          if (location) void openSourceCitation(app, location.citation, newTab)
          else
            openMarkdownFile(
              app,
              note.path,
              /\.md$/i.test(note.path) ? undefined : note.startLine,
              { newTab },
            )
        }}
        title={`${note.path} — ${t('views.related.openNewTab')}`}
        aria-label={note.title}
      >
        <span className="verbex-related-note-title-row">
          <strong>
            {note.title}
            {/\.(hwp|hwpx|pdf)$/i.test(note.path)
              ? ` ? ${(note.path.split('.').pop() ?? '').toUpperCase()}`
              : ''}
          </strong>
          <span className="verbex-related-note-signals">
            {note.signals.map((signal) => (
              <span
                key={signal}
                className="verbex-related-note-badge"
                data-signal={signal}
              >
                {signalLabel(signal)}
              </span>
            ))}
          </span>
        </span>
        <span className="verbex-related-note-path">{note.path}</span>
        {location && (
          <span className="verbex-related-note-location">
            {location.heading ? `${location.heading} · ` : ''}L
            {location.citation.startLine}
            {location.citation.endLine !== location.citation.startLine
              ? `–${location.citation.endLine}`
              : ''}
          </span>
        )}
        {note.snippet && (
          <span className="verbex-related-note-snippet">{note.snippet}</span>
        )}
        {note.category === 'related' && note.relation && (
          <span className="verbex-related-note-relation">
            {note.relation.replace(/_/g, ' ')}
          </span>
        )}
      </button>
      {note.companionPaths?.length ? (
        <span>
          {note.companionPaths.map((path) => (
            <a
              key={path}
              href={path}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                openMarkdownFile(app, path)
              }}
            >
              {path}
            </a>
          ))}
        </span>
      ) : null}
    </div>
  )
}

export function RelatedNotesView({
  app,
  plugin,
  limit = 10,
}: RelatedNotesViewProps) {
  const state = useActiveNoteRelated(app, plugin, { limit })
  const similar = state.notes
    .filter((note) => note.category === 'similar')
    .slice(0, limit)
  const related = state.notes
    .filter(
      (note) =>
        note.category === 'related' && note.relation !== 'folder_adjacent',
    )
    .slice(0, limit)

  return (
    <div className="verbex-related-view">
      <div className="verbex-related-header">
        <div>
          <h2>{t('views.related.title')}</h2>
          <div className="verbex-settings-desc">
            {state.activePath ?? t('views.related.openNoteHelp')}
          </div>
        </div>
        <button
          type="button"
          aria-label={t('views.related.refresh')}
          onClick={() => state.refresh({ allowOneShotEmbedding: true })}
          disabled={state.refreshing || !state.activePath}
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
      {!state.loading && state.notes.length === 0 && !state.error && (
        <div className="verbex-settings-desc">{t('views.related.noNotes')}</div>
      )}

      {similar.length > 0 && (
        <section className="verbex-related-section">
          <h3>{t('views.related.similar')}</h3>
          <div className="verbex-related-list">
            {similar.map((note) => (
              <RelatedNoteItem key={note.path} app={app} note={note} />
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="verbex-related-section">
          <h3>{t('views.related.related')}</h3>
          <div className="verbex-related-list">
            {related.map((note) => (
              <RelatedNoteItem key={note.path} app={app} note={note} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
