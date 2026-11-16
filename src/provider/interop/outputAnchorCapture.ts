import type {
  OutputAnchorScope,
  SavedOutputAnchorPage,
} from './outputAnchorRead'
import { SavedOutputAnchorStore } from './savedOutputAnchorStore'

/** Host-only opt-in scoped to one conversation; results are untrusted observations. */
export class OutputAnchorCapture {
  private readonly enabled = new Map<string, number>()
  private generation = 0
  private readonly store = new SavedOutputAnchorStore()
  private readonly listeners = new Set<() => void>()
  private readonly leases = new Map<
    string,
    {
      conversationId: string
      runId: string
      expires: number
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private disposed = false
  enable(conversationId: string): void {
    if (!this.disposed && conversationId && !this.enabled.has(conversationId)) {
      this.enabled.set(conversationId, ++this.generation)
      this.notify()
    }
  }
  requested = (conversationId: string): number | false =>
    !this.disposed && (this.enabled.get(conversationId) ?? false)
  accept = (page: SavedOutputAnchorPage, scope: OutputAnchorScope): void => {
    if (scope.leaseId) {
      if (!this.leaseCurrent(scope.leaseId, scope.conversationId, scope.runId))
        return
      this.store.accept(page, scope)
    }
    if (this.requested(scope.conversationId)) {
      const { leaseId: _leaseId, ...userScope } = scope
      this.store.accept(page, userScope)
    }
  }
  acquireHostLease(conversationId: string, runId: string) {
    if (this.disposed || !conversationId || !runId)
      throw new Error('Cannot acquire output anchor lease.')
    const leaseId = globalThis.crypto.randomUUID()
    const release = () => {
      const lease = this.leases.get(leaseId)
      if (!lease) return
      clearTimeout(lease.timer)
      this.leases.delete(leaseId)
      this.store.releaseLease(leaseId)
    }
    const expires = Date.now() + 5 * 60_000
    const timer = setTimeout(release, 5 * 60_000)
    this.leases.set(leaseId, { conversationId, runId, expires, timer })
    return { leaseId, release }
  }
  leaseCurrent = (
    leaseId: string,
    conversationId: string,
    runId: string,
  ): boolean => {
    const lease = this.leases.get(leaseId)
    return (
      !!lease &&
      !this.disposed &&
      lease.expires > Date.now() &&
      lease.conversationId === conversationId &&
      lease.runId === runId
    )
  }
  limitLease = (leaseId: string, expiresAt: string): void => {
    const lease = this.leases.get(leaseId)
    if (!lease) return
    const expiry = Date.parse(expiresAt)
    if (!Number.isFinite(expiry)) return
    lease.expires = Math.min(lease.expires, expiry)
    clearTimeout(lease.timer)
    lease.timer = setTimeout(
      () => {
        this.leases.delete(leaseId)
        this.store.releaseLease(leaseId)
      },
      Math.max(0, lease.expires - Date.now()),
    )
  }
  getLease(leaseId: string, preparationId: string) {
    return this.snapshotLease(leaseId, preparationId)?.pages
  }
  snapshotLease(leaseId: string, preparationId: string) {
    const lease = this.leases.get(leaseId)
    if (
      !lease ||
      !this.leaseCurrent(leaseId, lease.conversationId, lease.runId)
    )
      return undefined
    return this.store.snapshot(
      { conversationId: lease.conversationId, runId: lease.runId, leaseId },
      preparationId,
    )
  }
  get(conversationId: string, runId: string, preparationId: string) {
    if (!this.requested(conversationId)) return undefined
    return this.store.get({ conversationId, runId }, preparationId)
  }
  snapshot(conversationId: string, runId: string, preparationId: string) {
    if (!this.requested(conversationId)) return undefined
    return this.store.snapshot({ conversationId, runId }, preparationId)
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  release(conversationId: string): void {
    this.enabled.delete(conversationId)
    this.store.release(conversationId)
    this.notify()
  }
  dispose(): void {
    this.disposed = true
    this.enabled.clear()
    for (const lease of this.leases.values()) clearTimeout(lease.timer)
    this.leases.clear()
    this.store.clear()
    this.notify()
    this.listeners.clear()
  }
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* A view must not block cleanup. */
      }
    }
  }
}
