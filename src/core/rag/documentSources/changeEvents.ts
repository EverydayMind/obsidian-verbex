/** Minimal subscribe/notify set for projection changes. */
export class ChangeEvents {
  private listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  notify(): void {
    this.listeners.forEach((listener) => listener())
  }
}
