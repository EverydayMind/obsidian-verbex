/**
 * Do not initialize PGlite merely because a restored ChatView is mounted.
 * Opening the existing vector database is a main-thread operation and can
 * block Obsidian for several seconds on a large vault. Semantic retrieval is
 * optional and is initialized only by an explicit operation or a ready-only
 * query path.
 */
export function shouldWarmUpProviders(): boolean {
  return false
}

const PROVIDER_WARMUP_FALLBACK_DELAY_MS = 250
const PROVIDER_WARMUP_IDLE_TIMEOUT_MS = 2_000

type IdleScheduler = {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

/**
 * Defers optional semantic initialization until the first paint/startup work
 * has had a chance to settle. The timeout prevents an idle callback from
 * being postponed indefinitely in a busy Obsidian window.
 */
export function scheduleDeferredProviderWarmUp(
  task: () => unknown,
): () => void {
  let cancelled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let idleId: number | null = null
  const scheduler = globalThis as typeof globalThis & IdleScheduler
  const run = () => {
    if (cancelled) return
    void Promise.resolve(task()).catch(() => undefined)
  }

  if (typeof scheduler.requestIdleCallback === 'function') {
    idleId = scheduler.requestIdleCallback(run, {
      timeout: PROVIDER_WARMUP_IDLE_TIMEOUT_MS,
    })
  } else {
    timeoutId = setTimeout(run, PROVIDER_WARMUP_FALLBACK_DELAY_MS)
  }

  return () => {
    cancelled = true
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (idleId !== null && scheduler.cancelIdleCallback) {
      scheduler.cancelIdleCallback(idleId)
      idleId = null
    }
  }
}
