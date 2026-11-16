import type { Workspace } from 'obsidian'

import { L } from '../../i18n/modelText'
import { runtimeTimers } from '../../platform/runtime'

import { waitForDiscovery } from './discoveryWait'
export { withTimeout } from './discoveryWait'

/** Serialize discoveries so an old scan cannot overwrite a newer plugin set. */
export class DiscoveryLifecycle {
  private pending?: Promise<void>
  private again = false
  private notify = false
  private retryTimer?: ReturnType<typeof runtimeTimers.setTimeout>
  private disposed = false
  private readonly listeners = new Set<() => void>()
  private readonly detach: () => void

  constructor(
    workspace: Workspace | undefined,
    private readonly scan: () => Promise<void>,
  ) {
    const ref = workspace?.on(
      'agentinterop:providers-changed' as 'layout-change',
      () => {
        if (this.disposed) return
        // Payloads are hints only. Always rediscover identities and approvals.
        this.again = true
        this.notify = true
        if (!this.pending && !this.retryTimer) this.refreshInBackground()
      },
    )
    this.detach = () => {
      if (ref) workspace?.offref(ref)
    }
  }

  refresh(signal?: AbortSignal): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (signal?.aborted) return waitForDiscovery(Promise.resolve(), signal)
    if (!this.pending) {
      runtimeTimers.clearTimeout(this.retryTimer)
      this.retryTimer = undefined
      this.again = true
      let completed = false
      this.pending = Promise.resolve()
        .then(async () => {
          let scans = 0
          while (this.again && !this.disposed && scans++ < 2) {
            this.again = false
            await this.scan()
          }
          if (this.again && !this.disposed)
            throw new Error(
              L({
                ko: '플러그인 구성이 계속 바뀌고 있습니다. 잠시 뒤 다시 요청하세요.',
                en: `Plugin configuration keeps changing. Try again shortly.`,
              }),
            )
          completed = true
        })
        .finally(() => {
          this.pending = undefined
          if (this.disposed) return
          if (this.again) {
            this.retryTimer = runtimeTimers.setTimeout(() => {
              this.retryTimer = undefined
              this.refreshInBackground()
            }, 100)
          } else if (completed && this.notify) {
            this.notify = false
            for (const listener of this.listeners) {
              try {
                listener()
              } catch {
                console.warn('[Verbex] Provider discovery listener failed')
              }
            }
          }
        })
    }
    return waitForDiscovery(this.pending, signal)
  }

  private refreshInBackground(): void {
    void this.refresh().catch(() =>
      console.warn('[Verbex] Provider discovery did not settle'),
    )
  }

  onReady(listener: () => void): () => void {
    if (!this.disposed) this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    this.disposed = true
    this.again = false
    runtimeTimers.clearTimeout(this.retryTimer)
    this.detach()
    this.listeners.clear()
  }
}
