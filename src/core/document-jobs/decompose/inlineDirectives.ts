const variantName =
  /^(?!(?:fixed|omitted|style|decomposition|meta)$)[\p{L}\p{N}_]{1,12}$(?![\s\S])/u

export function directiveName(source: string): string | undefined {
  const match =
    /^<!--[ \t]*hwpx:(?:style[ \t]*=[ \t]*)?([^\s>]+)(?:[ \t]+(?:(?!-->).)*)?-->$/.exec(
      source.trim(),
    )
  const name = match?.[1]
  return name && name !== '1' && variantName.test(name) ? name : undefined
}

/** Split renderer directives while retaining source line numbers for observations. */
export function directiveLines(
  markdown: string,
): { text: string; line: number; ending: string }[] {
  let fence: { char: string; length: number } | undefined
  let inComment = false
  let lastEnding = '\n'
  let lineNumber = 0
  return (markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? []).flatMap((part) => {
    if (!part) return []
    lineNumber++
    const ending = /(?:\r\n|\n|\r)$/.exec(part)?.[0] ?? ''
    const line = ending ? part.slice(0, -ending.length) : part
    if (ending) lastEnding = ending
    const original = () => [{ text: line, line: lineNumber, ending }]
    if (!inComment) {
      if (/^(?: {4}|\t)/.test(line)) return original()
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
      if (fence) {
        if (
          marker?.[1].startsWith(fence.char) &&
          marker[1].length >= fence.length &&
          /^\s*$/.test(marker[2])
        )
          fence = undefined
        return original()
      }
      if (marker && (!marker[1].startsWith('`') || !marker[2].includes('`'))) {
        fence = { char: marker[1][0], length: marker[1].length }
        return original()
      }
    }
    const wasInComment = inComment
    let pos = 0
    while (pos < line.length) {
      const index = line.indexOf(inComment ? '-->' : '<!--', pos)
      if (index < 0) break
      pos = index + (inComment ? 3 : 4)
      inComment = !inComment
    }
    if (wasInComment || inComment) return original()
    const indent = /^( {0,3})/.exec(line)?.[1] ?? ''
    let rest = line.slice(indent.length)
    const pieces: string[] = []
    while (rest) {
      const match =
        /^<!--[ \t]*hwpx:(?:style[ \t]*=[ \t]*)?([^\s>]+)(?:[ \t]+(?:(?!-->).)*)?-->/.exec(
          rest,
        )
      if (!match || !directiveName(match[0])) break
      const remaining = rest.slice(match[0].length).replace(/^[ \t]+/, '')
      if (!remaining.trim()) break
      pieces.push(indent + match[0])
      rest = remaining
    }
    if (!pieces.length) return original()
    return [...pieces, indent + rest].map((text, index) => ({
      text,
      line: lineNumber,
      ending: index === pieces.length ? ending : ending || lastEnding,
    }))
  })
}

export function splitInlineDirectives(markdown: string): string {
  return directiveLines(markdown)
    .map(({ text, ending }) => text + ending)
    .join('')
}
