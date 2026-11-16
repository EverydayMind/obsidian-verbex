const LIMIT = 200_000
const WINDOW = 20

type Example = { line: number; text: string }

function withoutFrontmatter(text: string): string {
  return text.replace(
    /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/,
    (match) => match.replace(/[^\r\n]/g, ''),
  )
}

function normalize(text: string): string {
  return text
    .normalize('NFC')
    .replace(/<!--[ \t]*hwpx:[\s\S]*?-->/gi, '')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|(?:[-+*]|\d+[.)])[ \t]+)/gm, '')
    .replace(/[*_]/g, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function sampleOverlap(
  sample: string,
  draft: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  if (Array.from(sample).length > LIMIT || Array.from(draft).length > LIMIT)
    return
  const source = Array.from(normalize(withoutFrontmatter(sample)))
  const windows = new Map<string, number[]>()
  for (let i = 0; i + WINDOW <= source.length; i++) {
    const key = source.slice(i, i + WINDOW).join('')
    const positions = windows.get(key)
    if (positions) positions.push(i)
    else windows.set(key, [i])
  }
  const lines = withoutFrontmatter(draft).split(/\r?\n/)
  const examples: Example[] = []
  let count = 0
  for (let i = 0; i < lines.length; ) {
    signal?.throwIfAborted()
    if (!lines[i].trim()) {
      i++
      continue
    }
    const line = i + 1
    const block: string[] = []
    while (i < lines.length && lines[i].trim()) block.push(lines[i++])
    const chars = Array.from(normalize(block.join('\n')))
    for (let j = 0; j + WINDOW <= chars.length; j++) {
      const positions = windows.get(chars.slice(j, j + WINDOW).join(''))
      if (!positions) continue
      count++
      if (examples.length < 3) {
        let length = WINDOW
        for (const position of positions) {
          let n = WINDOW
          while (
            n < 30 &&
            j + n < chars.length &&
            position + n < source.length &&
            chars[j + n] === source[position + n]
          )
            n++
          length = Math.max(length, n)
          if (length === 30) break
        }
        examples.push({ line, text: chars.slice(j, j + length).join('') })
      }
      break
    }
  }
  return { count, examples }
}
