import { markdownBody } from './markdownFacts'

/** Keep complete blank-delimited blocks, including fenced blocks with blank lines. */
export function referenceExcerpt(markdown: string): string {
  const blocks: string[] = []
  let current: string[] = [],
    fence = ''
  for (const line of markdownBody(markdown).trim().split(/\r?\n/)) {
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (delimiter) {
      if (!fence) fence = delimiter
      else if (
        delimiter.startsWith(fence[0]) &&
        delimiter.length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(line)
      )
        fence = ''
    }
    if (!line.trim() && !fence) {
      if (current.length) blocks.push(current.join('\n'))
      current = []
    } else current.push(line)
  }
  if (current.length) blocks.push(current.join('\n'))
  let excerpt = ''
  for (const block of blocks) {
    const next = excerpt ? excerpt + '\n\n' + block : block
    if ([...next].length > 2000 || next.split('\n').length > 40) break
    excerpt = next
  }
  return excerpt
}
