import { useState } from 'react'

import { isDocumentPath } from '../../core/rag/documentSources/indexableSources'
import { t } from '../../i18n'

import type { RelatedTextSearchState } from './useRelatedTextSearch'

type RelatedTextSearchProps = {
  search: RelatedTextSearchState
  centerPath: string | null
  onOpen: (path: string) => void
}

/** A text box above the graph: notes like the typed text, one click opens. */
export function RelatedTextSearch({
  search,
  centerPath,
  onOpen,
}: RelatedTextSearchProps) {
  const [text, setText] = useState('')
  const similar = search.results.filter((note) => note.category === 'similar')

  return (
    <div className="verbex-related-search">
      <form
        className="verbex-related-search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          search.search(text)
        }}
      >
        <input
          type="search"
          value={text}
          placeholder={t('views.related.searchPlaceholder')}
          aria-label={t('views.related.searchPlaceholder')}
          onChange={(event) => {
            setText(event.target.value)
            if (!event.target.value.trim()) search.clear()
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return
            setText('')
            search.clear()
          }}
        />
        <button type="submit" disabled={!text.trim()}>
          {t('views.related.search')}
        </button>
      </form>

      {search.searchedText !== null && (
        <div className="verbex-related-search-results">
          <div className="verbex-related-search-summary">
            <span className="verbex-settings-desc" role="status">
              {search.searching
                ? t('views.related.searching')
                : similar.length === 0 && !search.error
                  ? t('views.related.searchNoResults')
                  : t('views.related.searchResults', {
                      count: similar.length,
                    })}
            </span>
            <button
              type="button"
              className="clickable-icon"
              onClick={() => {
                setText('')
                search.clear()
              }}
            >
              {t('views.related.clearSearch')}
            </button>
          </div>
          {search.error && (
            <div className="verbex-settings-callout" role="alert">
              {search.error}
            </div>
          )}
          {similar.length > 0 && (
            <ul className="verbex-related-search-list">
              {similar.map((note) => (
                <li key={note.path}>
                  <button
                    type="button"
                    className="verbex-related-search-item"
                    aria-current={note.path === centerPath ? 'true' : undefined}
                    onClick={() => onOpen(note.path)}
                  >
                    <span className="verbex-related-search-item-title">
                      {note.title}
                      {/* A document and a note can share a name. */}
                      {isDocumentPath(note.path) && (
                        <span className="verbex-related-search-item-kind">
                          {(note.path.split('.').pop() ?? '').toUpperCase()}
                        </span>
                      )}
                    </span>
                    {note.snippet && (
                      <span className="verbex-related-search-item-snippet">
                        {note.snippet}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
