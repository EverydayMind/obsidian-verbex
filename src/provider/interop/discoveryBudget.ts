import { L } from '../../i18n/modelText'

import { withTimeout } from './discoveryLifecycle'

export const DESCRIBE_CONCURRENCY = 4

/** One deadline for the entire scan, including time waiting for a worker. */
export async function discoverWithinBudget<T, R>(
  items: readonly T[],
  budgetMs: number,
  discover: (item: T) => Promise<R>,
): Promise<{ item: T; value?: R; error?: unknown }[]> {
  const deadline = Date.now() + budgetMs
  const results: { item: T; value?: R; error?: unknown }[] = new Array<{
    item: T
    value?: R
    error?: unknown
  }>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      const remaining = deadline - Date.now()
      try {
        if (remaining <= 0)
          throw new Error(
            L({ ko: '탐색 시간 초과', en: 'Discovery timed out' }),
          )
        const value = await withTimeout(
          Promise.resolve().then(() => discover(item)),
          remaining,
          L({ ko: '탐색 시간 초과', en: 'Discovery timed out' }),
        )
        results[index] = { item, value }
      } catch (error) {
        results[index] = { item, error }
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(DESCRIBE_CONCURRENCY, items.length) },
      worker,
    ),
  )
  return results
}
