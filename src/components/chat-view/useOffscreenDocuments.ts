import type { Workspace } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { NativeProviderHost } from '../../provider/interop/NativeProviderHost'

import type { OffscreenDoc } from './OffscreenUnsavedCard'

/** Keep late results from a previous conversation or closed view out of the current summary. */
export function useOffscreenDocuments(
  host: NativeProviderHost,
  workspace: Workspace,
  conversationId: string,
  busy: boolean,
) {
  const [state, setState] = useState<{
    conversationId: string
    documents: OffscreenDoc[]
  }>({ conversationId, documents: [] })
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const open = await host.openDocuments(conversationId)
      if (request !== sequence.current) return
      setState({
        conversationId,
        documents: open.filter(
          (doc) =>
            !doc.hasView &&
            doc.dirty &&
            doc.heldForAgent.includes(conversationId),
        ),
      })
    } catch {
      if (request === sequence.current)
        setState({ conversationId, documents: [] })
    }
  }, [host, conversationId])
  useEffect(() => {
    const requestCounter = sequence
    void refresh()
    const changed = () => {
      void refresh()
    }
    const refs = [
      workspace.on('layout-change', changed),
      workspace.on('active-leaf-change', changed),
    ]
    const unsubscribe = host.grants.subscribe(changed)
    return () => {
      requestCounter.current++
      refs.forEach((ref) => workspace.offref(ref))
      unsubscribe()
    }
  }, [host, workspace, refresh, busy])
  return {
    documents: state.conversationId === conversationId ? state.documents : [],
    refresh,
  }
}
