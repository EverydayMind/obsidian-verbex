export type PluginReadinessState =
  | 'initializing'
  | 'ready'
  | 'init_failed'
  | 'post_migration_ui_failed'

export type SearchIndexState = 'ready' | 'stale' | 'unavailable'

export type ReadinessStage = 'ui' | 'catalog' | 'lexical' | 'semantic'

export type ReadinessStageState =
  | 'pending'
  | 'ready'
  | 'stale'
  | 'unavailable'
  | 'failed'

export type ReadinessStageSnapshot = {
  state: ReadinessStageState
  error: string | null
}

export type ReadinessStages = Record<ReadinessStage, ReadinessStageSnapshot>

export function createReadinessStages(): ReadinessStages {
  return {
    ui: { state: 'pending', error: null },
    catalog: { state: 'pending', error: null },
    lexical: { state: 'pending', error: null },
    semantic: { state: 'pending', error: null },
  }
}

export type PluginReadinessSnapshot = {
  readinessState: PluginReadinessState
  searchIndexState: SearchIndexState
  stages: ReadinessStages
  initializationError: string | null
  postMigrationUiError: string | null
  lexicalIndexSyncError: string | null
}
