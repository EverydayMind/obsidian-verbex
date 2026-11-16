import type { BackgroundWorkScheduler } from '../background/backgroundScheduler'

/** Same delay as the vault-change embedding update (main.ts dirty index). */
export const TOOL_SEMANTIC_PREPARATION_DELAY_MS = 10_000

export type SemanticAvailabilityInput = {
  searchMode: string
  engineStatus:
    | (() => 'model_unset' | 'index_not_ready' | 'cooling_down' | 'ready')
    | null
  initializing: boolean
}

/** Tool-facing semantic availability, in the plan's priority order. */
export function semanticAvailability(
  input: SemanticAvailabilityInput,
):
  | 'lexical_only'
  | 'not_started'
  | 'initializing'
  | 'model_unset'
  | 'index_not_ready'
  | 'cooling_down'
  | 'ready' {
  if (input.searchMode === 'bm25') return 'lexical_only'
  if (input.engineStatus) return input.engineStatus()
  return input.initializing ? 'initializing' : 'not_started'
}

/**
 * A tool asked for semantic retrieval before the RAG engine existed: schedule
 * its creation once in the background. The current call never waits. Creating
 * the engine can open PGlite on the main thread, the same cost and timing as
 * the first vault edit's dirty-index update (DECISIONS §16).
 */
export function requestToolSemanticPreparation(input: {
  isActive: () => boolean
  scheduler: Pick<BackgroundWorkScheduler, 'hasPending' | 'schedule'>
  prepare: () => Promise<unknown>
}): void {
  if (!input.isActive() || input.scheduler.hasPending('rag-tool-demand')) return
  input.scheduler.schedule(
    'rag-tool-demand',
    async () => {
      if (input.isActive()) await input.prepare()
    },
    TOOL_SEMANTIC_PREPARATION_DELAY_MS,
  )
}
