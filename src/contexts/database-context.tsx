import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react'

import { DatabaseManager } from '../database/DatabaseManager'
import { LegacyTemplateManager } from '../database/modules/template/TemplateManager'
import { VectorManager } from '../database/modules/vector/VectorManager'

type DatabaseContextType = {
  getDatabaseManager: () => Promise<DatabaseManager>
  getVectorManager: () => Promise<VectorManager>
  getTemplateManager: () => Promise<LegacyTemplateManager>
}

const DatabaseContext = createContext<DatabaseContextType | null>(null)

export function DatabaseProvider({
  children,
  getDatabaseManager,
  warmUp = true,
}: {
  children: React.ReactNode
  getDatabaseManager: () => Promise<DatabaseManager>
  warmUp?: boolean
}) {
  const getVectorManager = useCallback(async () => {
    return (await getDatabaseManager()).getVectorManager()
  }, [getDatabaseManager])

  const getTemplateManager = useCallback(async () => {
    return (await getDatabaseManager()).getTemplateManager()
  }, [getDatabaseManager])

  useEffect(() => {
    if (warmUp) {
      // Start initialization only for embedding/hybrid surfaces. BM25-only
      // chat does not need the database at mount time.
      void getDatabaseManager()
    }
  }, [getDatabaseManager, warmUp])

  const value = useMemo(() => {
    return { getDatabaseManager, getVectorManager, getTemplateManager }
  }, [getDatabaseManager, getVectorManager, getTemplateManager])

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): DatabaseContextType {
  const context = useContext(DatabaseContext)
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider')
  }
  return context
}
