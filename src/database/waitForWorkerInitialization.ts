import { runtimeTimers } from '../platform/runtime'
/** Wait for a worker client while detecting startup errors and silent hangs. */
export async function waitForWorkerInitialization<T>(
  worker: Worker,
  creation: Promise<T>,
  timeoutMs: number,
  onReady?: (client: T) => T,
): Promise<T> {
  let timer: ReturnType<typeof runtimeTimers.setTimeout> | undefined
  let rejectFailure: (error: Error) => void = () => undefined
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject
  })
  const failed = () =>
    rejectFailure(new Error('PGlite worker initialization failed'))
  try {
    worker.addEventListener('error', failed)
    worker.addEventListener('messageerror', failed)
    const client = await Promise.race([
      creation,
      failure,
      new Promise<never>((_, reject) => {
        timer = runtimeTimers.setTimeout(
          () => reject(new Error('PGlite worker initialization timed out')),
          timeoutMs,
        )
      }),
    ])
    // Attach lifetime monitoring before removing the startup listeners.
    return onReady ? onReady(client) : client
  } finally {
    runtimeTimers.clearTimeout(timer)
    worker.removeEventListener('error', failed)
    worker.removeEventListener('messageerror', failed)
  }
}
