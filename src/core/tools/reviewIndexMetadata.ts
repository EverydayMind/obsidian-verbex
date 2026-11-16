export function getIndexProvenance(markdown: string): string | null {
  return (
    frontmatterValue(markdown, 'verbex_index') ??
    frontmatterValue(markdown, 'verbex_wiki')
  )
}

export function frontmatterValue(markdown: string, key: string): string | null {
  const block = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1]
  if (!block) return null
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escaped}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(
    block,
  )
  return match?.[1]?.trim() ?? null
}
