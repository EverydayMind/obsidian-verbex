import { runtimeTimers } from '../platform/runtime'
import { stringifyUnknown } from '../utils/stringifyUnknown'

import { LexicalIndexMutation } from './LexicalIndex'

export type LexicalIndexUpdateQueueOptions = {
  debounceMs?: number
  onError?: (error: unknown) => void
  /** Let a shared background scheduler own the debounce timer. */
  scheduleFlush?: () => void
}

export type LexicalIndexUpdateQueueHandlers = {
  applyMutations: (mutations: readonly LexicalIndexMutation[]) => Promise<void>
  refresh: () => Promise<void>
}

type MutationSource = 'event' | 'reconcile'

/**
 * Serializes all BM25 snapshot writes and exposes the in-flight promise to
 * startup reconciliation. The queue is intentionally independent of Plugin
 * so event bursts and startup tests can exercise the same write contract.
 */
export class LexicalIndexUpdateQueue {
  private readonly mutations = new Map<
    string,
    { mutation: LexicalIndexMutation; source: MutationSource }
  >()
  private needsRefresh = false
  private timer: ReturnType<typeof runtimeTimers.setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private lastFlushError: unknown = null
  private generationValue = 0
  private readonly latestEventGeneration = new Map<string, number>()
  private readonly debounceMs: number

  constructor(
    private readonly handlers: LexicalIndexUpdateQueueHandlers,
    private readonly options: LexicalIndexUpdateQueueOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 1500
  }

  get generation(): number {
    return this.generationValue
  }

  enqueue(
    mutation: LexicalIndexMutation,
    source: MutationSource = 'event',
  ): void {
    const path = mutation.type === 'upsert' ? mutation.file.path : mutation.path
    this.mutations.set(path, { mutation, source })
    this.generationValue += 1
    if (source === 'event') {
      this.latestEventGeneration.set(path, this.generationValue)
    }
    this.scheduleFlush()
  }

  enqueueMany(
    mutations: readonly LexicalIndexMutation[],
    source: MutationSource = 'event',
  ): void {
    for (const mutation of mutations) {
      this.enqueue(mutation, source)
    }
  }

  /**
   * Reconcile mutations are older observations. When a vault event arrived
   * after the observation and is still queued, the event wins for that path.
   */
  enqueueReconcile(
    mutations: readonly LexicalIndexMutation[],
    computedAtGeneration: number,
  ): void {
    for (const mutation of mutations) {
      const path =
        mutation.type === 'upsert' ? mutation.file.path : mutation.path
      const pending = this.mutations.get(path)
      const newerEventGeneration = this.latestEventGeneration.get(path) ?? 0
      if (
        newerEventGeneration > computedAtGeneration ||
        (computedAtGeneration !== this.generationValue &&
          pending?.source === 'event')
      ) {
        continue
      }
      this.mutations.set(path, { mutation, source: 'reconcile' })
    }
    if (mutations.length > 0) {
      this.scheduleFlush()
    }
  }

  requestFullRefresh(): void {
    this.needsRefresh = true
    this.mutations.clear()
    this.generationValue += 1
    this.scheduleFlush()
  }

  async flushNow(options: { surfaceErrors?: boolean } = {}): Promise<void> {
    this.clearTimer()
    const inFlight = this.inFlight ?? this.startFlush()
    await inFlight
    if (options.surfaceErrors && this.lastFlushError) {
      if (this.lastFlushError instanceof Error) {
        throw this.lastFlushError
      }
      throw new Error(stringifyUnknown(this.lastFlushError))
    }
  }

  dispose(): void {
    this.clearTimer()
    this.mutations.clear()
    this.needsRefresh = false
    this.latestEventGeneration.clear()
  }

  private scheduleFlush(): void {
    if (this.options.scheduleFlush) {
      this.options.scheduleFlush()
      return
    }
    this.clearTimer()
    this.timer = runtimeTimers.setTimeout(() => {
      this.timer = null
      void this.flushNow().catch(() => {
        // Normal background updates report through onError; this catch keeps
        // the timer callback from producing an unhandled rejection.
      })
    }, this.debounceMs)
  }

  private clearTimer(): void {
    if (this.timer) {
      runtimeTimers.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private startFlush(): Promise<void> {
    const run = this.flushPending().finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null
      }
    })
    this.inFlight = run
    return run
  }

  private async flushPending(): Promise<void> {
    this.lastFlushError = null
    while (this.needsRefresh || this.mutations.size > 0) {
      const refresh = this.needsRefresh
      this.needsRefresh = false
      const mutations = [...this.mutations.values()].map(
        ({ mutation }) => mutation,
      )
      this.mutations.clear()
      try {
        if (refresh) {
          await this.handlers.refresh()
        } else {
          await this.handlers.applyMutations(mutations)
        }
      } catch (error) {
        this.lastFlushError = error
        this.options.onError?.(error)
      }
    }
  }
}
