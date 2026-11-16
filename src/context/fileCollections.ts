export function mergeUniqueByPath<T extends { path: string }>(
  primary: T[],
  extra: T[],
): T[] {
  const seen = new Set(primary.map((file) => file.path))
  const merged = [...primary]
  for (const file of extra) {
    if (seen.has(file.path)) continue
    seen.add(file.path)
    merged.push(file)
  }
  return merged
}
