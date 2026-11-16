import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
} from 'react'

import { RAGEngine } from '../core/rag/ragEngine'

import { scheduleDeferredProviderWarmUp } from './providerWarmup'

export type RAGContextType = {
  getRAGEngine: () => Promise<RAGEngine>
  getRAGEngineIfReady: () => RAGEngine | null
}

const RAGContext = createContext<RAGContextType | null>(null)

export function RAGProvider({
  getRAGEngine,
  getRAGEngineIfReady,
  children,
  warmUp = false,
}: PropsWithChildren<{
  getRAGEngine: () => Promise<RAGEngine>
  getRAGEngineIfReady: () => RAGEngine | null
  warmUp?: boolean
}>) {
  useEffect(() => {
    if (warmUp) {
      // Start initialization only for embedding/hybrid surfaces, after the
      // initial render and BM25 startup work have had a chance to settle.
      return scheduleDeferredProviderWarmUp(() => getRAGEngine())
    }
  }, [getRAGEngine, warmUp])

  const value = useMemo(() => {
    return { getRAGEngine, getRAGEngineIfReady }
  }, [getRAGEngine, getRAGEngineIfReady])

  return <RAGContext.Provider value={value}>{children}</RAGContext.Provider>
}

export function useRAG() {
  const context = useContext(RAGContext)
  if (!context) {
    throw new Error('useRAG must be used within a RAGProvider')
  }
  return context
}
