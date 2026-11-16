/** Shared by the renderer and Node CLI probes; resolve the host at call time. */
export function runtimeGlobal() {
  // Node CLI probes have no window. Preserve their actual global object.
  return typeof window === 'undefined' ? globalThis : window
}

export type TimerHandle = { cancel: () => void }

export const runtimeTimers = {
  setTimeout(callback: () => void, delay?: number): TimerHandle {
    if (typeof window !== 'undefined') {
      const handle = window.setTimeout(callback, delay)
      return { cancel: () => window.clearTimeout(handle) }
    }
    // CLI/worker fallback retains Node's opaque timer handle inside the closure.
    const handle = setTimeout(callback, delay)
    return { cancel: () => clearTimeout(handle) }
  },
  clearTimeout(handle?: TimerHandle | null): void {
    handle?.cancel()
  },
  setInterval(callback: () => void, delay?: number): TimerHandle {
    if (typeof window !== 'undefined') {
      const handle = window.setInterval(callback, delay)
      return { cancel: () => window.clearInterval(handle) }
    }
    // CLI probes also run the provider diagnostic heartbeat without a window.
    const handle = setInterval(callback, delay)
    return { cancel: () => clearInterval(handle) }
  },
  clearInterval(handle?: TimerHandle | null): void {
    handle?.cancel()
  },
}
