export class BudgetNoticeTracker {
  private readonly seen = new Map<string, Set<string>>()

  show(
    conversation: string,
    providers: readonly { id: string; name: string }[],
    enabled: boolean,
    aborted: boolean,
    notice: (name: string) => void,
  ) {
    if (!enabled || aborted) return
    const seen = this.seen.get(conversation) ?? new Set<string>()
    for (const provider of providers) {
      if (seen.has(provider.id)) continue
      notice(provider.name)
      seen.add(provider.id)
    }
    this.seen.set(conversation, seen)
  }
}
