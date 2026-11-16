import { type TimerHandle, runtimeTimers } from '../../platform/runtime'

export type FrameHandle = number | TimerHandle

export type FrameScheduler = (callback: () => void) => FrameHandle

export type FrameCanceller = (handle: FrameHandle) => void

export type FrameCoalescer<T> = {
  schedule: (value: T) => void
  flush: () => void
  cancel: () => void
  hasPending: () => boolean
}

function defaultSchedule(callback: () => void): FrameHandle {
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    return window.requestAnimationFrame(callback)
  }
  return runtimeTimers.setTimeout(callback, 16)
}

function defaultCancel(handle: FrameHandle): void {
  if (
    typeof handle === 'number' &&
    typeof window !== 'undefined' &&
    window.cancelAnimationFrame
  ) {
    window.cancelAnimationFrame(handle)
    return
  }
  if (typeof handle !== 'number') runtimeTimers.clearTimeout(handle)
}

/**
 * Coalesces high-frequency stream updates into one UI commit per frame.
 * `flush` is deliberately explicit so terminal/error/cancel paths cannot
 * lose the final text that arrived before the scheduled frame.
 */
export function createFrameCoalescer<T>(
  onFlush: (value: T) => void,
  schedule: FrameScheduler = defaultSchedule,
  cancel: FrameCanceller = defaultCancel,
): FrameCoalescer<T> {
  let pending: T | undefined
  let handle: FrameHandle | null = null

  const flush = () => {
    if (handle !== null) {
      cancel(handle)
      handle = null
    }
    if (pending === undefined) return
    const value = pending
    pending = undefined
    onFlush(value)
  }

  return {
    schedule: (value) => {
      pending = value
      if (handle !== null) return
      handle = schedule(() => {
        handle = null
        if (pending === undefined) return
        const next = pending
        pending = undefined
        onFlush(next)
      })
    },
    flush,
    cancel: () => {
      if (handle !== null) cancel(handle)
      handle = null
      pending = undefined
    },
    hasPending: () => pending !== undefined,
  }
}
