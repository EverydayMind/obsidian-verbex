import type {
  OutputAnchorScope,
  SavedOutputAnchorPage,
} from './outputAnchorRead'

type RecordValue = {
  scope: OutputAnchorScope
  expires: number
  pages: SavedOutputAnchorPage[]
}

function clonePage(page: SavedOutputAnchorPage): SavedOutputAnchorPage {
  if (page.version === 'saved-output-anchors/0.3')
    return { ...page, anchors: page.anchors.map((anchor) => ({ ...anchor })) }
  if (page.version === 'saved-output-anchors/0.2')
    return { ...page, anchors: page.anchors.map((anchor) => ({ ...anchor })) }
  return { ...page, anchors: page.anchors.map((anchor) => ({ ...anchor })) }
}

/** Ephemeral observations only; possession never authorizes document editing. */
export class SavedOutputAnchorStore {
  private readonly records = new Map<string, RecordValue>()
  private key(
    scope: Pick<OutputAnchorScope, 'conversationId' | 'runId' | 'leaseId'>,
    preparationId: string,
  ) {
    return JSON.stringify([
      scope.conversationId,
      scope.runId,
      preparationId,
      scope.leaseId ?? null,
    ])
  }
  private prune(now: number) {
    for (const [key, value] of this.records)
      if (value.expires <= now) this.records.delete(key)
  }
  accept = (page: SavedOutputAnchorPage, scope: OutputAnchorScope): void => {
    const now = Date.now()
    this.prune(now)
    const expires = Date.parse(scope.expiresAt)
    if (
      !scope.conversationId ||
      !scope.runId ||
      !Number.isFinite(expires) ||
      expires <= now
    )
      return
    const key = this.key(scope, page.preparationId)
    if (page.offset === 0) {
      this.records.delete(key)
      this.records.set(key, {
        scope: { ...scope },
        expires: Math.min(expires, now + 5 * 60_000),
        pages: [],
      })
    }
    const record = this.records.get(key)
    const first = record?.pages[0],
      previous = record?.pages.at(-1)
    if (
      !record ||
      (previous ? previous.nextOffset !== page.offset : page.offset !== 0) ||
      (first &&
        (first.version !== page.version ||
          first.preparationDigest !== page.preparationDigest ||
          first.destination !== page.destination ||
          first.archiveSha256 !== page.archiveSha256 ||
          first.sectionSha256 !== page.sectionSha256 ||
          first.total !== page.total)) ||
      record.pages.length >= 10 ||
      scope.expiresAt !== record.scope.expiresAt
    ) {
      this.records.delete(key)
      return
    }
    record.pages.push(clonePage(page))
    while (this.records.size > 16) {
      const oldest = [...this.records.keys()][0]
      if (oldest === undefined) break
      this.records.delete(oldest)
    }
  }
  get(
    scope: Pick<OutputAnchorScope, 'conversationId' | 'runId' | 'leaseId'>,
    preparationId: string,
  ): SavedOutputAnchorPage[] | undefined {
    return this.snapshot(scope, preparationId)?.pages
  }
  snapshot(
    scope: Pick<OutputAnchorScope, 'conversationId' | 'runId' | 'leaseId'>,
    preparationId: string,
  ) {
    this.prune(Date.now())
    const record = this.records.get(this.key(scope, preparationId))
    if (!record) return undefined
    return {
      expiresAt: record.expires,
      pages: record.pages.map(clonePage),
    }
  }
  release(conversationId: string): void {
    for (const [key, value] of this.records)
      if (value.scope.conversationId === conversationId && !value.scope.leaseId)
        this.records.delete(key)
  }
  releaseLease(leaseId: string): void {
    for (const [key, value] of this.records)
      if (value.scope.leaseId === leaseId) this.records.delete(key)
  }
  clear(): void {
    this.records.clear()
  }
}
