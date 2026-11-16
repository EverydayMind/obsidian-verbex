import { runtimeTimers } from '../../platform/runtime'
export type BackgroundTaskKey =
  | 'document-extraction'
  | 'lexical-index'
  | 'embedding-index'
  | 'database-save'
  | 'rag-tool-demand'

export type BackgroundSchedulerOptions = {
  onError?: (key: BackgroundTaskKey, error: unknown) => void
}

type ScheduledTask = {
  callback: () => Promise<void>
  dueAt: number
  sequence: number
}

const TASK_PRIORITY: Record<BackgroundTaskKey, number> = {
  'lexical-index': 10,
  'document-extraction': 15,
  'embedding-index': 20,
  'database-save': 30,
  'rag-tool-demand': 20,
}

/**
 * Coalesces low-priority background work behind one timer and one serial
 * execution loop. The scheduler deliberately knows nothing about vault or
 * database state; each owner keeps its own queue and supplies an idempotent
 * flush callback.
 */
export class BackgroundWorkScheduler {
  private readonly tasks = new Map<BackgroundTaskKey, ScheduledTask>()
  private timer: ReturnType<typeof runtimeTimers.setTimeout> | null = null
  private drainPromise: Promise<void> | null = null
  private sequence = 0
  private disposed = false

  constructor(private readonly options: BackgroundSchedulerOptions = {}) {}

  schedule(
    key: BackgroundTaskKey,
    callback: () => Promise<void>,
    delayMs = 0,
  ): void {
    if (this.disposed) return
    this.tasks.set(key, {
      callback,
      dueAt: Date.now() + Math.max(delayMs, 0),
      sequence: ++this.sequence,
    })
    this.armTimer()
  }

  cancel(key: BackgroundTaskKey): void {
    this.tasks.delete(key)
    this.armTimer()
  }

  hasPending(key?: BackgroundTaskKey): boolean {
    return key ? this.tasks.has(key) : this.tasks.size > 0
  }

  async flushNow(key?: BackgroundTaskKey): Promise<void> {
    if (this.disposed) return
    if (key) {
      const task = this.tasks.get(key)
      if (task) task.dueAt = 0
    } else {
      for (const task of this.tasks.values()) task.dueAt = 0
    }
    this.clearTimer()
    await this.requestDrain()
  }

  dispose(): void {
    this.disposed = true
    this.tasks.clear()
    this.clearTimer()
  }

  private requestDrain(): Promise<void> {
    if (!this.drainPromise) {
      const drain = this.drain().finally(() => {
        if (this.drainPromise === drain) this.drainPromise = null
      })
      this.drainPromise = drain
    }
    return this.drainPromise
  }

  private async drain(): Promise<void> {
    while (!this.disposed) {
      const now = Date.now()
      const dueTasks = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= now)
        .sort(
          ([leftKey, left], [rightKey, right]) =>
            TASK_PRIORITY[leftKey] - TASK_PRIORITY[rightKey] ||
            left.sequence - right.sequence,
        )
      if (dueTasks.length === 0) {
        this.armTimer()
        return
      }

      for (const [key, task] of dueTasks) {
        // A callback may reschedule the same key while an earlier snapshot is
        // draining. Only remove the entry when it is still that snapshot.
        if (this.tasks.get(key) !== task) continue
        this.tasks.delete(key)
        try {
          await task.callback()
        } catch (error) {
          this.options.onError?.(key, error)
        }
      }
    }
  }

  private armTimer(): void {
    this.clearTimer()
    if (this.disposed || this.tasks.size === 0 || this.drainPromise) return
    const nextDueAt = Math.min(
      ...[...this.tasks.values()].map((task) => task.dueAt),
    )
    this.timer = runtimeTimers.setTimeout(
      () => {
        this.timer = null
        void this.requestDrain()
      },
      Math.max(nextDueAt - Date.now(), 0),
    )
  }

  private clearTimer(): void {
    if (this.timer) {
      runtimeTimers.clearTimeout(this.timer)
      this.timer = null
    }
  }
}
