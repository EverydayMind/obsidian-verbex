type SentMessage = {
  role: string
  content?: unknown
  tool_call?: { id: string }
  toolImageSource?: string
  images?: unknown
}

const MAX_RESULTS = 500

function imageUrls(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return (content as unknown[]).flatMap((part) => {
    if (!part || typeof part !== 'object') return []
    const p = part as { type?: unknown; image_url?: { url?: unknown } }
    return p.type === 'image_url' && typeof p.image_url?.url === 'string'
      ? [p.image_url.url]
      : []
  })
}

/**
 * Tracks which provider observations the model has actually been shown.
 * A token counts only while the complete, unmodified result that carried it
 * is part of the model request that produced the current tool calls. Eviction
 * stubs, compaction summaries and truncation change the message text, so the
 * comparison fails and the token drops out without a rule per transform.
 * One ledger lives for one run; tokens of earlier runs are never revived.
 */
export class ObservationLedger {
  private lastRead?: { key: string; text: string }
  private readonly results = new Map<
    string,
    { text: string; tokens: string[]; images: readonly string[] }
  >()
  private included: readonly string[] = Object.freeze([])

  /** Advisory only: every read still runs; this memory is scoped to this run. */
  repeatedRead(key: string, text: string): boolean {
    const same = this.lastRead?.key === key && this.lastRead.text === text
    this.lastRead = { key, text }
    return same
  }

  invalidateRepeatedRead(): void {
    this.lastRead = undefined
  }

  /** Remembers the tokens of a tool result exactly as it will enter the transcript. */
  record(
    callId: string,
    text: string,
    tokens: readonly string[],
    images: readonly string[] = [],
  ): void {
    if (!tokens.length) return
    this.results.set(callId, { text, tokens: [...tokens], images: [...images] })
    if (this.results.size > MAX_RESULTS)
      this.results.delete(this.results.keys().next().value as string)
  }

  /** Called with the final message array of every model request. */
  sent = (messages: readonly SentMessage[]): void => {
    const tokens: string[] = []
    for (const message of messages) {
      if (message.role !== 'tool' || !message.tool_call) continue
      const result = this.results.get(message.tool_call.id)
      const companion = messages.filter(
        (m) => m.role === 'user' && m.toolImageSource === message.tool_call?.id,
      )
      const images = companion.flatMap((m) => imageUrls(m.content))
      if (
        result &&
        message.content === result.text &&
        JSON.stringify(result.images) === JSON.stringify(images)
      )
        tokens.push(...result.tokens)
    }
    this.included = Object.freeze(tokens)
  }

  /** Tokens the model saw in the request that produced the calls now executing. */
  current(): readonly string[] {
    return this.included
  }
}
