const MARKED_OWNER_RE =
  /(?:^|[^\p{L}\p{N}_])(?:(?:담당자|담당)(?=[:\s])\s*:?|(?:owner|assignee)\s*:)\s*(\[\[[^\]]+\]\]|[^\s,; (📅]+)/giu

function linkName(link: string): string | undefined {
  const [target, alias] = link.split('|')
  const name =
    alias ?? target.split('#')[0].split('/').pop()?.replace(/\.md$/i, '')
  return name?.trim() || undefined
}

export function taskOwner(line: string): string | undefined {
  const body = line.replace(/^\s*[-*+]\s+\[[^\]]\]\s*/, '')
  let hasMarked = false
  let lastLinked: string | undefined
  let lastMarked: string | undefined
  for (const match of body.matchAll(MARKED_OWNER_RE)) {
    hasMarked = true
    const raw = match[1]
    if (raw.startsWith('[[')) {
      const resolved = linkName(raw.slice(2, -2))
      if (resolved) lastLinked = resolved
      lastMarked = resolved
    } else {
      lastMarked = raw
    }
  }
  if (hasMarked) return lastLinked ?? lastMarked
  const leading = body.match(/^([^[\]()#:\n]{1,40}):/)
  const name = leading?.[1].trim()
  if (name && !/^\d+$/.test(name)) return name
  const mention = body.match(/@([^\s,.;:()[\]]+)/)
  if (mention) return mention[1]
  const link = body.match(/\[\[([^\]]+)\]\]/)
  return link ? linkName(link[1]) : undefined
}
