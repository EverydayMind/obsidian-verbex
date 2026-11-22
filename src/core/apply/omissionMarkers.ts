export const OMISSION_MARKERS = [
  '<!-- ... existing content ... -->',
  '<!-- ...existing content... -->',
  '<!-- existing content -->',
  '<!-- 기존 내용 -->',
  '<!-- ... 기존 내용 ... -->',
  '<!-- 기존 내용 생략 -->',
] as const

export function inspectOmissions(block: string) {
  const lines = block.split(/\r?\n/)
  const markerLines = new Set<number>()
  let fence = ''
  lines.forEach((line, index) => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (match) {
      const token = match[1]
      if (!fence) fence = token
      else if (token.startsWith(fence[0]) && token.length >= fence.length)
        fence = ''
      return
    }
    if (!fence && (OMISSION_MARKERS as readonly string[]).includes(line.trim()))
      markerLines.add(index)
  })
  const content = lines
    .map((line, index) => (line.trim() && !markerLines.has(index) ? index : -1))
    .filter((index) => index >= 0)
  const first = content[0] ?? lines.length
  const last = content[content.length - 1] ?? -1
  const positions = [...markerLines].map((line) => ({
    line,
    position:
      line < first
        ? ('start' as const)
        : line > last
          ? ('end' as const)
          : ('internal' as const),
  }))
  return {
    markerLines,
    positions,
    text: markerLines.size
      ? lines
          .filter((_, index) => !markerLines.has(index))
          .join(block.includes('\r\n') ? '\r\n' : '\n')
      : block,
  }
}

export function prepareDraftContent(
  block: string,
  strategy: 'replace' | 'append' | 'section',
  exists: boolean,
) {
  const result = inspectOmissions(block)
  if (exists && strategy === 'replace' && result.positions.length)
    return { error: 'replace' as const }
  if (
    exists &&
    strategy === 'section' &&
    result.positions.some((item) => item.position === 'internal')
  )
    return { error: 'section' as const }
  if (result.positions.length && !result.text.trim())
    return { error: 'empty' as const }
  return { content: result.text }
}
