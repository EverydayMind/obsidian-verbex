export type EmbeddingIndexMutation =
  | {
      type: 'upsert'
      path: string
      observedMtime: number
      generation: number
    }
  | {
      type: 'remove'
      path: string
      observedMtime: number | null
      generation: number
    }

export type EmbeddingIndexWork = {
  fullReconcile: boolean
  mutations: EmbeddingIndexMutation[]
}

/**
 * Coalesces vault events without losing the newest generation for a path.
 * Full reconcile remains an explicit escape hatch for settings changes,
 * startup recovery, or a queue that may have been lost across a crash.
 */
export class EmbeddingIndexMutationQueue {
  private readonly mutations = new Map<string, EmbeddingIndexMutation>()
  private fullReconcile = false
  private generationValue = 0

  get generation(): number {
    return this.generationValue
  }

  get size(): number {
    return this.mutations.size
  }

  hasPending(): boolean {
    return this.fullReconcile || this.mutations.size > 0
  }

  enqueueUpsert(path: string, observedMtime: number): void {
    this.enqueue({
      type: 'upsert',
      path,
      observedMtime,
      generation: this.nextGeneration(),
    })
  }

  enqueueRemove(path: string, observedMtime: number | null = null): void {
    this.enqueue({
      type: 'remove',
      path,
      observedMtime,
      generation: this.nextGeneration(),
    })
  }

  /** Normalize rename into an atomic old-path remove plus new-path upsert. */
  enqueueRename(
    oldPath: string,
    newPath: string | null,
    observedMtime: number | null,
  ): void {
    const generation = this.nextGeneration()
    this.setIfNewer({
      type: 'remove',
      path: oldPath,
      observedMtime: null,
      generation,
    })
    if (newPath) {
      this.setIfNewer({
        type: 'upsert',
        path: newPath,
        observedMtime: observedMtime ?? 0,
        generation,
      })
    }
  }

  requestFullReconcile(): void {
    this.fullReconcile = true
    this.nextGeneration()
  }

  drain(): EmbeddingIndexWork | null {
    if (!this.hasPending()) return null
    const work: EmbeddingIndexWork = {
      fullReconcile: this.fullReconcile,
      mutations: [...this.mutations.values()],
    }
    this.fullReconcile = false
    this.mutations.clear()
    return work
  }

  /** Requeue a failed snapshot without overwriting newer events. */
  requeue(work: EmbeddingIndexWork): void {
    if (work.fullReconcile) {
      this.fullReconcile = true
    }
    for (const mutation of work.mutations) {
      this.setIfNewer(mutation)
    }
  }

  clear(): void {
    this.fullReconcile = false
    this.mutations.clear()
  }

  private enqueue(mutation: EmbeddingIndexMutation): void {
    this.setIfNewer(mutation)
  }

  private setIfNewer(mutation: EmbeddingIndexMutation): void {
    const existing = this.mutations.get(mutation.path)
    if (!existing || existing.generation <= mutation.generation) {
      this.mutations.set(mutation.path, mutation)
    }
    this.generationValue = Math.max(this.generationValue, mutation.generation)
  }

  private nextGeneration(): number {
    this.generationValue += 1
    return this.generationValue
  }
}
