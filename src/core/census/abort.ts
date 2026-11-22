export function checkCensusAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}

/** Cancel waiting without leaving an abort listener or starting delayed reads. */
export async function censusAbortable<T>(
  work: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    void work.catch(() => {})
    checkCensusAbort(signal)
  }
  if (!signal) return work
  let stop!: () => void
  const aborted = new Promise<never>((_, reject) => {
    stop = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    return await Promise.race([work, aborted])
  } finally {
    signal.removeEventListener('abort', stop)
  }
}
