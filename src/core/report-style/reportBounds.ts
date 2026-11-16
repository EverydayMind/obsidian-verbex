import type { StyleSnapshot } from './types'

/** Bounded discovery summary. Detailed unsupported refs remain paged facts. */
export function unsupportedSummary(input: StyleSnapshot['unsupported']) {
  const items: { feature: string; refs: string[]; totalRefs: number }[] = []
  for (const entry of input) {
    const item = {
      feature: entry.feature,
      refs: entry.refs.slice(0, 20),
      totalRefs: entry.refs.length,
    }
    if (
      new TextEncoder().encode(JSON.stringify([...items, item])).byteLength >
      16 * 1024
    )
      break
    items.push(item)
  }
  return {
    unsupported: items,
    unsupportedCoverage: {
      totalFeatures: input.length,
      returnedFeatures: items.length,
      totalReferences: input.reduce(
        (total, item) => total + item.refs.length,
        0,
      ),
      returnedReferences: items.reduce(
        (total, item) => total + item.refs.length,
        0,
      ),
    },
  }
}
