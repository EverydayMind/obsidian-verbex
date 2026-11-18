function linkName(link: string): string | undefined {
  const [target, alias] = link.split('|')
  const name =
    alias ?? target.split('#')[0].split('/').pop()?.replace(/\.md$/i, '')
  return name?.trim() || undefined
}

export function taskOwner(line: string): string | undefined {
  const body = line.replace(/^\s*[-*+]\s+\[[^\]]\]\s*/, '')
  const marked = body.match(
    /(?:^|[^\p{L}\p{N}_])(?:(?:담당자|담당)(?=[:\s])\s*:?|(?:owner|assignee)\s*:)\s*(\[\[[^\]]+\]\]|[^\s,; (📅]+)/iu,
  )
  if (marked)
    return marked[1].startsWith('[[')
      ? linkName(marked[1].slice(2, -2))
      : marked[1]
  const leading = body.match(/^([^[\]()#:\n]{1,40}):/)
  const name = leading?.[1].trim()
  if (name && !/^\d+$/.test(name)) return name
  const mention = body.match(/@([^\s,.;:()[\]]+)/)
  if (mention) return mention[1]
  const link = body.match(/\[\[([^\]]+)\]\]/)
  return link ? linkName(link[1]) : undefined
}
