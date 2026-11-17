import type { EmbeddingErrorKind } from '../../database/modules/vector/VectorManager'

export type EmbeddingIndexActivity = {
  phase: 'idle' | 'waiting' | 'updating' | 'hold'
  progress?: {
    completedChunks: number
    totalChunks: number
    totalFiles: number
  }
  holdReason?: EmbeddingErrorKind
  lastRun?: {
    finishedAt: number
    totalFiles: number
    failedFiles: number
    failedChunks: number
    ok: boolean
  }
}

export function embeddingIndexPhase(
  hold: boolean,
  updating: boolean,
  pending: boolean,
): EmbeddingIndexActivity['phase'] {
  return hold ? 'hold' : updating ? 'updating' : pending ? 'waiting' : 'idle'
}

export function shouldNotifyEmbeddingIndex(
  source: 'automatic' | 'manual',
  rebuilding: boolean,
  totalFiles: number,
  ok: boolean,
): boolean {
  return source === 'automatic' && !rebuilding && totalFiles >= 100 && ok
}

export class EmbeddingIndexActivityStore {
  private pending = false
  private updating = false
  private hold: EmbeddingErrorKind | undefined
  private progress: EmbeddingIndexActivity['progress']
  private lastRun: EmbeddingIndexActivity['lastRun']
  private listeners = new Set<(activity: EmbeddingIndexActivity) => void>()

  getSnapshot(): EmbeddingIndexActivity {
    return {
      phase: embeddingIndexPhase(
        Boolean(this.hold),
        this.updating,
        this.pending,
      ),
      progress: this.progress,
      holdReason: this.hold,
      lastRun: this.lastRun,
    }
  }
  subscribe(listener: (activity: EmbeddingIndexActivity) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  setPending(pending: boolean): void {
    this.pending = pending
    this.emit()
  }
  setHold(hold?: EmbeddingErrorKind): void {
    this.hold = hold
    this.emit()
  }
  start(): void {
    this.updating = true
    this.progress = { completedChunks: 0, totalChunks: 0, totalFiles: 0 }
    this.emit()
  }
  update(progress: NonNullable<EmbeddingIndexActivity['progress']>): void {
    this.progress = progress
    this.emit()
  }
  finish(lastRun: NonNullable<EmbeddingIndexActivity['lastRun']>): void {
    this.updating = false
    this.progress = undefined
    this.lastRun = lastRun
    this.emit()
  }
  private emit(): void {
    const snapshot = this.getSnapshot()
    this.listeners.forEach((listener) => listener(snapshot))
  }
}
