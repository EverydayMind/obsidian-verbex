/** Status-change listeners; one that throws never stops the others. */
export class StatusListeners {
  private readonly listeners = new Set<() => void>()

  add(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        console.warn('[Verbex] Provider status listener failed')
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}
