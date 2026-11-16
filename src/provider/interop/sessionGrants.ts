/**
 * Document-level edit grants: "in this conversation the agent may edit the
 * working copy of this document". Held in memory only. A grant is bound to
 * the provider object and descriptor the user saw and to the document
 * incarnation, not to the document epoch: undo/redo and human edits keep it;
 * reload, rename, reopen and provider reload end it.
 */
import type { InteropDiagnostics } from './diagnostics'

export type SessionGrant = {
  conversationId: string
  providerId: string
  generation: number
  digest: string
  path: string
  sessionId: string
  incarnation: string
}

const key = (
  grant: Pick<SessionGrant, 'conversationId' | 'providerId' | 'path'>,
) => JSON.stringify([grant.conversationId, grant.providerId, grant.path])
const fields = (value: Partial<SessionGrant>) =>
  Object.keys(value) as (keyof SessionGrant)[]

export class SessionGrantStore {
  constructor(private readonly diagnostics?: InteropDiagnostics) {}
  private readonly grants = new Map<string, SessionGrant>()
  private readonly listeners = new Set<() => void>()
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private changed(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch {
        /* UI observers do not decide permissions. */
      }
    }
  }

  /** True only for an exact match. A grant for another state of the same document ends here. */
  has(candidate: SessionGrant): boolean {
    const grant = this.grants.get(key(candidate))
    if (!grant) return false
    const same = fields(candidate).every(
      (field) => grant[field] === candidate[field],
    )
    if (!same) {
      this.grants.delete(key(candidate))
      this.changed()
      this.diagnostics?.begin('grant', grant).finish('grant.invalidate')
    }
    return same
  }
  add(grant: SessionGrant): void {
    this.grants.set(key(grant), Object.freeze({ ...grant }))
    this.changed()
    this.diagnostics?.begin('grant', grant).finish('grant.add')
  }
  list(): SessionGrant[] {
    return [...this.grants.values()]
  }
  /** Ends every grant that matches the given fields and returns them. */
  revoke(filter: Partial<SessionGrant> = {}): SessionGrant[] {
    const ended: SessionGrant[] = []
    for (const [id, grant] of this.grants) {
      if (!fields(filter).every((field) => grant[field] === filter[field]))
        continue
      this.grants.delete(id)
      ended.push(grant)
      this.diagnostics?.begin('grant', grant).finish('grant.revoke')
    }
    if (ended.length) this.changed()
    return ended
  }
}
