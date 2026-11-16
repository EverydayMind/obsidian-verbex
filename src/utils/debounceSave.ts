import { runtimeTimers } from '../platform/runtime'

/** Trailing saves with a bounded wait; flush returns the latest invocation. */
export function debounceSave<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  wait: number,
  { maxWait }: { maxWait: number },
) {
  let trailing: ReturnType<typeof runtimeTimers.setTimeout> | undefined
  let deadline: ReturnType<typeof runtimeTimers.setTimeout> | undefined
  let pending: Args | undefined
  let result: Result | undefined
  const clear = () => {
    runtimeTimers.clearTimeout(trailing)
    runtimeTimers.clearTimeout(deadline)
    trailing = deadline = undefined
  }
  const flush = () => {
    clear()
    if (pending) {
      const args = pending
      pending = undefined
      result = callback(...args)
    }
    return result
  }
  const debounced = (...args: Args) => {
    pending = args
    runtimeTimers.clearTimeout(trailing)
    trailing = runtimeTimers.setTimeout(flush, wait)
    deadline ??= runtimeTimers.setTimeout(flush, Math.max(wait, maxWait))
    return result
  }
  debounced.flush = flush
  debounced.cancel = () => {
    clear()
    pending = undefined
  }
  return debounced
}
