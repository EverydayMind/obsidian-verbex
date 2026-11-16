// Owns "is this plugin instance still allowed to start new work". The gate is
// closed synchronously at the start of onunload (before any await), so late
// continuations of startup stages or lazy factories cannot publish resources,
// register listeners or show notices on a plugin that is shutting down.
//
// It does not cancel work that is already past its point of no return (an
// atomic save, an external commit); those settle on their own. A timeout is
// never treated as proof that a task was cancelled.

export type PluginRuntimeState = 'starting' | 'running' | 'stopping' | 'stopped'

export class LifecycleStoppedError extends Error {
  constructor() {
    super('Verbex plugin is stopping')
    this.name = 'LifecycleStoppedError'
  }
}

export class PluginRuntimeLifecycle {
  private currentState: PluginRuntimeState = 'starting'
  private readonly abortController = new AbortController()

  get state(): PluginRuntimeState {
    return this.currentState
  }

  /** Aborted when stop() is first called; pass to cancellable work. */
  get signal(): AbortSignal {
    return this.abortController.signal
  }

  get isActive(): boolean {
    return this.currentState === 'starting' || this.currentState === 'running'
  }

  markRunning(): void {
    if (this.currentState === 'starting') this.currentState = 'running'
  }

  /** Throws LifecycleStoppedError once stop() was called. */
  assertActive(): void {
    if (!this.isActive) throw new LifecycleStoppedError()
  }

  /**
   * Closes the gate and aborts the shared signal. Idempotent; returns true
   * only for the call that actually performed the transition.
   */
  stop(): boolean {
    if (!this.isActive) return false
    this.currentState = 'stopping'
    this.abortController.abort()
    return true
  }

  /** Marks cleanup as finished. */
  markStopped(): void {
    this.currentState = 'stopped'
  }

  /** Forward unload and caller cancellation without leaving listeners behind.
   * Await settlement: abort does not prove that an external commit stopped.
   */
  async runWork<T>(
    callerSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.assertActive()
    const controller = new AbortController()
    const abort = () => controller.abort()
    const sources = [
      ...new Set(
        [this.signal, callerSignal].filter((signal): signal is AbortSignal =>
          Boolean(signal),
        ),
      ),
    ]
    try {
      for (const signal of sources) {
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      }
      assertWorkActive(controller.signal)
      return await operation(controller.signal)
    } finally {
      for (const signal of sources) signal.removeEventListener('abort', abort)
    }
  }

  /** For results shown in the editor or a notice: null when unload happened
   * before or during the work, so callers stop without inserting or reporting.
   * Errors raised while still active propagate unchanged.
   */
  async runForUi<T>(
    callerSignal: AbortSignal | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    try {
      const result = await this.runWork(callerSignal, operation)
      return this.isActive ? result : null
    } catch (error) {
      if (!this.isActive) return null
      throw error
    }
  }

  /**
   * Runs `create`, and publishes its result only if the plugin is still
   * active when it resolves. Otherwise the freshly built resource is disposed
   * (disposal errors are logged, never thrown) and LifecycleStoppedError is
   * raised, so a late factory cannot resurrect shut-down state.
   */
  async publishIfActive<T>(
    create: () => Promise<T>,
    dispose: (resource: T) => Promise<void> | void,
  ): Promise<T> {
    this.assertActive()
    const resource = await create()
    if (!this.isActive) {
      try {
        await dispose(resource)
      } catch (error) {
        console.error(
          'Failed to dispose a resource created after unload:',
          error,
        )
      }
      throw new LifecycleStoppedError()
    }
    return resource
  }
}

/** Check between preparation awaits, before starting another business action. */
export function assertWorkActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Request aborted')
    error.name = 'AbortError'
    throw error
  }
}
