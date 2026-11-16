import {
  ProviderCallInterrupted,
  assertProviderCallAvailable,
  providerCallCancelled,
  providerCallTimedOut,
} from './providerCallError'
import type { ProviderCallOptions } from './providerCallTypes'
import { observeVaultEvents } from './vaultEventObservers'

export { ProviderCallInterrupted } from './providerCallError'

/** Holds the lock and observes Vault events until actual completion, even after timeout. */
export async function callProvider(
  options: ProviderCallOptions,
): Promise<{ raw: unknown; vaultEvents: number }> {
  const { app, busy, providerId, signal } = options
  assertProviderCallAvailable(signal, busy, providerId)
  busy.add(providerId)
  const started = performance.now()
  let interruptedWait = false
  let vaultEvents = 0
  let releaseObservers: () => void
  try {
    releaseObservers = observeVaultEvents(app.vault, (event, path, oldPath) => {
      vaultEvents++
      options.onVaultEvent?.(event, path, oldPath)
    })
  } catch (error) {
    busy.delete(providerId)
    throw error
  }
  const controller = new AbortController()
  const abort = () => {
    interruptedWait = true
    options.trace?.mark('abort')
    controller.abort()
  }
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  let failed = true
  const actual = Promise.resolve()
    .then(() => {
      if (controller.signal.aborted)
        throw new ProviderCallInterrupted(providerCallCancelled())
      options.trace?.mark('provider.start', {
        providerId,
        timeoutMs: options.timeoutMs,
      })
      return options.invoke(controller.signal)
    })
    .then((value) => {
      failed = false
      return value
    })
    .finally(() => {
      options.trace?.mark(failed ? 'provider.failed' : 'provider.settled', {
        late: interruptedWait,
        durationMs: performance.now() - started,
        vaultEvents,
      })
      busy.delete(providerId)
      releaseObservers()
    })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raw = await Promise.race([
      actual,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          interruptedWait = true
          options.trace?.mark('timeout', {
            busy: true,
            durationMs: performance.now() - started,
          })
          reject(new ProviderCallInterrupted(providerCallTimedOut(), 'timeout'))
          controller.abort()
        }, options.timeoutMs)
        const stop = () =>
          reject(
            new ProviderCallInterrupted(providerCallCancelled(), 'cancelled'),
          )
        if (controller.signal.aborted) stop()
        else controller.signal.addEventListener('abort', stop, { once: true })
      }),
    ])
    return { raw, vaultEvents }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    actual.catch(() => {})
  }
}
