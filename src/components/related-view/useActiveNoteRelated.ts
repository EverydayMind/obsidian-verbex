import { App, TFile, WorkspaceLeaf } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RELATED_VIEW_TYPE } from '../../constants'
import { documentQueue } from '../../core/rag/documentSources/extractionQueue'
import {
  type RelatedNote,
  isRelatedNotesAbort,
} from '../../core/rag/relatedNotes'
import VerbexPlugin from '../../main'

export type RelatedNotesState = {
  excludeDailyNotes: boolean
  setExcludeDailyNotes: (value: boolean) => Promise<void>
  activePath: string | null
  notesPath: string | null
  pendingPath: string | null
  notes: RelatedNote[]
  loading: boolean
  refreshing: boolean
  error: string | null
  refresh: (options?: { allowOneShotEmbedding?: boolean }) => void
  showRelatedFor: (path: string) => void
  holdRelatedFor: (path: string) => void
}

/** How long a slow semantic result may hold back the base result. */
const BASE_RESULT_FALLBACK_MS = 1500

function activeNotePath(app: App): string | null {
  return app.workspace.getActiveFile()?.path ?? null
}

export function useActiveNoteRelated(
  app: App,
  plugin: VerbexPlugin,
  viewOptions?: { limit?: number },
): RelatedNotesState {
  const [settings, setSettings] = useState(plugin.settings.verbex.relatedNotes)
  const effectiveLimit = viewOptions?.limit ?? Math.max(settings.limit ?? 0, 10)
  const [activePath, setActivePath] = useState<string | null>(() =>
    activeNotePath(app),
  )
  const [notesPath, setNotesPath] = useState<string | null>(null)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [notes, setNotes] = useState<RelatedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestedPathRef = useRef<string | null>(null)
  const heldPathRef = useRef<string | null>(null)
  const debounceTimerRef = useRef<number | null>(null)

  const releaseHoldIfMoved = useCallback(() => {
    if (heldPathRef.current && activeNotePath(app) !== heldPathRef.current) {
      heldPathRef.current = null
    }
  }, [app])

  const load = useCallback(
    async (
      requestedPath?: string | null,
      options: { allowOneShotEmbedding?: boolean; pending?: boolean } = {},
    ) => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      const path =
        requestedPath !== undefined
          ? requestedPath
          : heldPathRef.current
            ? lastRequestedPathRef.current
            : activeNotePath(app)
      lastRequestedPathRef.current = path
      const requestId = ++requestIdRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setActivePath(path)
      setPendingPath(options.pending && path ? path : null)
      setError(null)
      setRefreshing(true)
      if (!path) {
        setNotes([])
        setNotesPath(null)
        setPendingPath(null)
        setLoading(false)
        setRefreshing(false)
        return
      }

      let showBaseOnFailure = () => {}
      try {
        const base = await plugin.getRelatedNotesBase({
          activePath: path,
          limit: effectiveLimit,
          signal: controller.signal,
        })
        if (requestId !== requestIdRef.current) return
        // One result per load reaches the screen when it can: the circles
        // move once, straight to where they end up. With the semantic engine
        // ready its result follows shortly, so the base result is held back
        // and shown only if the semantic one fails or is slow.
        let baseShown = false
        const showBase = () => {
          if (baseShown || requestId !== requestIdRef.current) return
          baseShown = true
          setNotes(base.notes)
          setNotesPath(path)
          setLoading(false)
        }
        let rag = plugin.getRAGEngineIfReady()
        if (!rag) showBase()
        if (!rag && options.allowOneShotEmbedding) {
          rag = await plugin.getRAGEngine('related-notes-manual-refresh')
        }
        if (!rag) return
        const baseFallbackTimer = window.setTimeout(
          showBase,
          BASE_RESULT_FALLBACK_MS,
        )
        controller.signal.addEventListener('abort', () =>
          window.clearTimeout(baseFallbackTimer),
        )
        showBaseOnFailure = () => {
          window.clearTimeout(baseFallbackTimer)
          showBase()
        }
        const semantic = await rag.findRelatedNotes({
          activePath: path,
          limit: effectiveLimit,
          signal: controller.signal,
          allowOneShotEmbedding: options.allowOneShotEmbedding === true,
          activeContent: base.activeContent,
          baseCandidates: {
            bm25Candidates: base.bm25Candidates,
            graphCandidates: base.graphCandidates,
          },
        })
        window.clearTimeout(baseFallbackTimer)
        if (requestId !== requestIdRef.current) return
        setNotes(semantic)
        setNotesPath(path)
        setLoading(false)
      } catch (caught) {
        showBaseOnFailure()
        if (requestId !== requestIdRef.current) return
        if (!isRelatedNotesAbort(caught, controller.signal)) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRefreshing(false)
          setPendingPath(null)
        }
      }
    },
    [app, plugin, effectiveLimit],
  )

  // The debounced reload reads the active note when it fires, not when it was
  // scheduled. An event can arrive while Obsidian still reports the note that
  // is being left; loading that remembered path 400ms later would put the
  // previous note back in the centre after the user had moved on.
  const schedule = useCallback(
    (skipIfAlreadyRequested: boolean) => {
      const timer = window.setTimeout(() => {
        debounceTimerRef.current = null
        releaseHoldIfMoved()
        if (heldPathRef.current) return
        const path = activeNotePath(app)
        if (skipIfAlreadyRequested && path === lastRequestedPathRef.current) {
          return
        }
        void load(path)
      }, 400)
      return timer
    },
    [app, load, releaseHoldIfMoved],
  )

  useEffect(() => {
    const removeSettingsListener = plugin.addSettingsChangeListener(
      (nextSettings) => {
        setSettings(nextSettings.verbex.relatedNotes)
      },
    )
    return removeSettingsListener
  }, [plugin])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(initialTimer)
  }, [load, settings.excludeDailyNotes])

  useEffect(() => {
    const queue = (skipIfAlreadyRequested = false) => {
      if (heldPathRef.current) return
      if (!settings.autoRefresh) return
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = schedule(skipIfAlreadyRequested)
    }
    const handleActiveLeafChange = (leaf: WorkspaceLeaf | null) => {
      if (leaf?.view.getViewType?.() === RELATED_VIEW_TYPE) return
      releaseHoldIfMoved()
      // Opening a note from the graph has already loaded it: do not load the
      // same note again. Decided when the timer fires (see schedule).
      queue(true)
    }
    const handleModify = (file: TFile) => {
      releaseHoldIfMoved()
      if (file.path === activeNotePath(app)) queue()
    }
    const handleRename = (file: TFile, oldPath: string) => {
      if (oldPath === heldPathRef.current) {
        heldPathRef.current = file.path
      }
      releaseHoldIfMoved()
      if (oldPath === lastRequestedPathRef.current) {
        void load(file.path)
        return
      }
      const current = activeNotePath(app)
      if (file.path === current || oldPath === current) queue()
    }
    const handleDelete = (file: TFile) => {
      if (file.path === lastRequestedPathRef.current) {
        if (debounceTimerRef.current !== null) {
          window.clearTimeout(debounceTimerRef.current)
          debounceTimerRef.current = null
        }
        requestIdRef.current += 1
        abortRef.current?.abort()
        lastRequestedPathRef.current = null
        heldPathRef.current = null
        setActivePath(null)
        setNotes([])
        setNotesPath(null)
        setPendingPath(null)
        setLoading(false)
        setRefreshing(false)
        return
      }
      if (file.path === heldPathRef.current) {
        heldPathRef.current = null
      }
    }

    app.workspace.on('active-leaf-change', handleActiveLeafChange)
    app.vault.on('modify', handleModify)
    app.vault.on('rename', handleRename)
    app.vault.on('delete', handleDelete)
    const removeRAGListener = plugin.addRAGReadyListener(() => {
      void load()
    })
    const removeDocumentListener = documentQueue(app).subscribe(() => {
      releaseHoldIfMoved()
      if (activeNotePath(app)) queue()
    })
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      app.workspace.off('active-leaf-change', handleActiveLeafChange)
      app.vault.off('modify', handleModify)
      app.vault.off('rename', handleRename)
      app.vault.off('delete', handleDelete)
      removeRAGListener()
      removeDocumentListener()
    }
  }, [app, load, plugin, releaseHoldIfMoved, schedule, settings.autoRefresh])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
    },
    [],
  )

  const showRelatedFor = useCallback(
    (path: string) => {
      heldPathRef.current = null
      void load(path, { pending: true })
    },
    [load],
  )

  const holdRelatedFor = useCallback((path: string) => {
    heldPathRef.current = path
  }, [])

  return {
    excludeDailyNotes: settings.excludeDailyNotes,
    setExcludeDailyNotes: async (value) => {
      const current = plugin.settings
      await plugin.setSettings({
        ...current,
        verbex: {
          ...current.verbex,
          relatedNotes: {
            ...current.verbex.relatedNotes,
            excludeDailyNotes: value,
          },
        },
      })
    },
    activePath,
    notesPath,
    pendingPath,
    notes,
    loading,
    refreshing,
    error,
    refresh: (options) => void load(undefined, options),
    showRelatedFor,
    holdRelatedFor,
  }
}
