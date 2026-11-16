import { L } from '../../i18n/modelText'
import { runtimeTimers } from '../../platform/runtime'
import { forwardRejection } from '../../utils/forwardRejection'
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof runtimeTimers.setTimeout> | undefined
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = runtimeTimers.setTimeout(() => reject(new Error(label)), ms)
    }),
  ]).finally(() => runtimeTimers.clearTimeout(timer))
}

/** Cancel this caller's wait without cancelling discovery shared by other callers. */
export function waitForDiscovery(
  work: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) return work
  return new Promise<void>((resolve, reject) => {
    const stop = () =>
      reject(
        new Error(
          L({
            ko: '플러그인 탐색 대기가 취소됐습니다.',
            en: `Waiting for plugin discovery was cancelled.`,
          }),
        ),
      )
    if (signal.aborted) return stop()
    signal.addEventListener('abort', stop, { once: true })
    work.then(
      () => {
        signal.removeEventListener('abort', stop)
        resolve()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', stop)
        forwardRejection(reject, error)
      },
    )
  })
}
