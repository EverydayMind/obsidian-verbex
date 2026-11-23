import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type RelatedNote,
  isRelatedNotesAbort,
} from '../../core/rag/relatedNotes'
import VerbexPlugin from '../../main'

export type RelatedTextSearchState = {
  /** The text the shown results are for; null when nothing was searched. */
  searchedText: string | null
  results: RelatedNote[]
  searching: boolean
  error: string | null
  search: (text: string) => void
  clear: () => void
}

/**
 * Notes like a typed text, by the same ranking as the similar notes of an
 * open note: the keyword hits come first, then the fused keyword + embedding
 * ranking replaces them once the semantic engine answers.
 */
export function useRelatedTextSearch(
  plugin: VerbexPlugin,
  limit: number,
): RelatedTextSearchState {
  const [searchedText, setSearchedText] = useState<string | null>(null)
  const [results, setResults] = useState<RelatedNote[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    requestIdRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const clear = useCallback(() => {
    stop()
    setSearchedText(null)
    setResults([])
    setSearching(false)
    setError(null)
  }, [stop])

  const search = useCallback(
    (rawText: string) => {
      const text = rawText.trim()
      if (!text) {
        clear()
        return
      }
      stop()
      const requestId = requestIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      const current = () => requestId === requestIdRef.current
      setSearchedText(text)
      setResults([])
      setSearching(true)
      setError(null)

      void (async () => {
        try {
          const base = await plugin.getRelatedNotesForText({
            text,
            limit,
            signal: controller.signal,
          })
          if (!current()) return
          setResults(base.notes)
          // An explicit search may open the semantic engine, as the refresh
          // button does; without it the keyword results stay.
          const rag =
            plugin.getRAGEngineIfReady() ??
            (await plugin
              .getRAGEngine('related-notes-text-search')
              .catch(() => null))
          if (!current() || !rag?.isSemanticSearchReady()) return
          const fused = await rag.findNotesSimilarToText({
            text,
            limit,
            signal: controller.signal,
            bm25Candidates: base.bm25Candidates,
          })
          if (!current()) return
          setResults(fused)
        } catch (caught) {
          if (!current() || isRelatedNotesAbort(caught, controller.signal)) {
            return
          }
          setError(caught instanceof Error ? caught.message : String(caught))
        } finally {
          if (current()) setSearching(false)
        }
      })()
    },
    [clear, limit, plugin, stop],
  )

  return { searchedText, results, searching, error, search, clear }
}
