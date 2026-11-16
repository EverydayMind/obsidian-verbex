import type { SelectEmbedding } from '../database/schema'

export type QueryProgressState =
  | {
      type: 'reading-mentionables'
    }
  | {
      type: 'indexing'
      indexProgress: IndexProgress
    }
  | {
      type: 'querying'
    }
  | {
      type: 'graph-expanding'
    }
  | {
      type: 'querying-done'
      queryResult: (Omit<SelectEmbedding, 'embedding'> & {
        similarity: number
      })[]
    }
  | {
      type: 'agent-thinking'
      iteration: number
    }
  | {
      type: 'agent-tool-start'
      toolName: string
      args: string
      iteration: number
    }
  | {
      type: 'large-file-progress'
      operation: 'analysis' | 'transform'
      phase: 'mapping' | 'reducing' | 'verifying' | 'transforming'
      path: string
      index: number
      total: number
    }
  | {
      type: 'idle'
    }

export type IndexProgress = {
  completedChunks: number
  totalChunks: number
  totalFiles: number
  waitingForRateLimit?: boolean
}
