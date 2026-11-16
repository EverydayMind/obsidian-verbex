import {
  EmbeddingIndexState,
  VerbexSettings,
} from '../../settings/schema/setting.types'

/**
 * `embeddingModelId` is the user's selected target. The active model is kept
 * separately so a pending model switch can continue serving semantic search
 * from the last complete index.
 */
export function getActiveEmbeddingModelId(settings: VerbexSettings): string {
  return (
    settings.embeddingIndexState?.activeModelId ?? settings.embeddingModelId
  )
}

export function isEmbeddingIndexReady(settings: VerbexSettings): boolean {
  const state = settings.embeddingIndexState
  if (state === null || state.phase === 'ready') return true

  // During a model switch the old active index remains available while the
  // new target is pending/rebuilding/failed. A same-model explicit rebuild
  // has no separate old index, so it is unavailable until it completes.
  return state.activeModelId !== state.targetModelId
}

export function selectEmbeddingModel(
  settings: VerbexSettings,
  targetModelId: string,
): Extract<EmbeddingIndexState, { phase: 'pending' | 'ready' }> {
  const activeModelId = getActiveEmbeddingModelId(settings)
  if (activeModelId === targetModelId) {
    return {
      phase: 'ready',
      activeModelId,
      targetModelId,
    }
  }
  return {
    phase: 'pending',
    activeModelId,
    targetModelId,
  }
}

export function beginEmbeddingIndexRebuild(
  settings: VerbexSettings,
  targetModelId: string,
  startedAt = Date.now(),
): Extract<EmbeddingIndexState, { phase: 'rebuilding' }> {
  const activeModelId = getActiveEmbeddingModelId(settings)
  return {
    phase: 'rebuilding',
    activeModelId,
    targetModelId,
    startedAt,
  }
}

export function completeEmbeddingIndexRebuild(
  state: Extract<EmbeddingIndexState, { phase: 'rebuilding' }>,
): EmbeddingIndexState {
  return {
    phase: 'ready',
    activeModelId: state.targetModelId,
    targetModelId: state.targetModelId,
  }
}

export function failEmbeddingIndexRebuild(
  state: Extract<EmbeddingIndexState, { phase: 'rebuilding' }>,
  error: string,
): EmbeddingIndexState {
  return {
    phase: 'failed',
    activeModelId: state.activeModelId,
    targetModelId: state.targetModelId,
    startedAt: state.startedAt,
    error,
  }
}

export function cancelEmbeddingIndexRebuild(
  state: Extract<EmbeddingIndexState, { phase: 'rebuilding' }>,
): EmbeddingIndexState {
  if (state.activeModelId === state.targetModelId) {
    return failEmbeddingIndexRebuild(state, 'Embedding index rebuild cancelled')
  }
  return {
    phase: 'pending',
    activeModelId: state.activeModelId,
    targetModelId: state.targetModelId,
  }
}
