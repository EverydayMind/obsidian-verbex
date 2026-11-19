/**
 * A hue (0-359) for each name in a known set, spread evenly round the colour
 * wheel so no two names share one however many there are. Names are placed in
 * sorted order, so the result does not depend on the order they were found in.
 */
export function assignHues(names: Iterable<string>): Map<string, number> {
  const sorted = [...new Set(names)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  const hues = new Map<string, number>()
  sorted.forEach((name, index) => {
    hues.set(name, Math.round((index * 360) / sorted.length))
  })
  return hues
}
