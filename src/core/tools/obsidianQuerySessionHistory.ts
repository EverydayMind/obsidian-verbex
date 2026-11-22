/** Bounded tombstones distinguish TTL and capacity loss without retaining files. */
export class QuerySessionHistory {
  private readonly entries = new Map<string, 'expired' | 'evicted'>()
  remember(id: string, reason: 'expired' | 'evicted') {
    this.entries.set(id, reason)
    const oldest = [...this.entries.keys()][0]
    if (this.entries.size > 128 && oldest !== undefined)
      this.entries.delete(oldest)
  }
  reason(id: string) {
    return this.entries.get(id) ?? 'unavailable'
  }
}
