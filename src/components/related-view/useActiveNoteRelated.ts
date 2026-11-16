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
  notes: RelatedNote[]
  loading: boolean
  refreshing: boolean
  error: string | null
  refresh: (options?: { allowOneShotEmbedding?: boolean }) => void
}

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
  const [notes, setNotes] = useState<RelatedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async (
      requestedPath?: string | null,
      options: { allowOneShotEmbedding?: boolean } = {},
    ) => {
      const path = requestedPath ?? activeNotePath(app)
      const requestId = ++requestIdRef.current
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setActivePath(path)
      setError(null)
      setRefreshing(true)
      if (!path) {
        setNotes([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      try {
        const base = await plugin.getRelatedNotesBase({
          activePath: path,
          limit: effectiveLimit,
          signal: controller.signal,
        })
        if (requestId !== requestIdRef.current) return
        setNotes(base.notes)
        setLoading(false)

        let rag = plugin.getRAGEngineIfReady()
        if (!rag && options.allowOneShotEmbedding) {
          rag = await plugin.getRAGEngine('related-notes-manual-refresh')
        }
        if (!rag) return
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
        if (requestId !== requestIdRef.current) return
        setNotes(semantic)
      } catch (caught) {
        if (requestId !== requestIdRef.current) return
        if (!isRelatedNotesAbort(caught, controller.signal)) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [app, plugin, effectiveLimit],
  )

  const schedule = useCallback(
    (path?: string | null) => {
      const timer = window.setTimeout(() => {
        void load(path)
      }, 400)
      return timer
    },
    [load],
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
    let timer: number | null = null
    const queue = (path?: string | null) => {
      if (!settings.autoRefresh) return
      if (timer !== null) window.clearTimeout(timer)
      timer = schedule(path)
    }
    const handleActiveLeafChange = (leaf: WorkspaceLeaf | null) => {
      if (leaf?.view.getViewType?.() === RELATED_VIEW_TYPE) return
      queue(activeNotePath(app))
    }
    const handleModify = (file: TFile) => {
      if (file.path === activeNotePath(app)) queue(file.path)
    }
    const handleRename = (file: TFile, oldPath: string) => {
      const current = activeNotePath(app)
      if (file.path === current || oldPath === current) queue(file.path)
    }
    const handleDelete = (file: TFile) => {
      if (file.path === activePath) {
        setActivePath(null)
        setNotes([])
      }
    }

    app.workspace.on('active-leaf-change', handleActiveLeafChange)
    app.vault.on('modify', handleModify)
    app.vault.on('rename', handleRename)
    app.vault.on('delete', handleDelete)
    const removeRAGListener = plugin.addRAGReadyListener(() => {
      if (activeNotePath(app)) void load(activeNotePath(app))
    })
    const removeDocumentListener = documentQueue(app).subscribe(() => {
      const path = activeNotePath(app)
      if (path) queue(path)
    })
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      app.workspace.off('active-leaf-change', handleActiveLeafChange)
      app.vault.off('modify', handleModify)
      app.vault.off('rename', handleRename)
      app.vault.off('delete', handleDelete)
      removeRAGListener()
      removeDocumentListener()
    }
  }, [activePath, app, load, plugin, schedule, settings.autoRefresh])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      abortRef.current?.abort()
    },
    [],
  )

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
    notes,
    loading,
    refreshing,
    error,
    refresh: (options) => void load(undefined, options),
  }
}
