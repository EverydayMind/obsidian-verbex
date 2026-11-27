export type CodeBlockFact = {
  /** First word of the info string, lowercased. */
  language: string
  /** 1-based line of the opening fence. */
  line: number
}

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** Line count of a leading YAML frontmatter block, or 0 when there is none. */
function frontmatterLines(lines: readonly string[]): number {
  if (!/^---[ \t]*$/.test(lines[0] ?? '')) return 0
  for (let i = 1; i < lines.length; i++)
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) return i + 1
  return 0
}

/**
 * Fenced code blocks that declare a language, in document order. Follows the
 * CommonMark fence rules that matter here: a fence is three or more backticks
 * or tildes, the closing fence uses the same character and is at least as
 * long, and fences inside an open block are plain text. An unclosed block runs
 * to the end of the note. Blocks without a language are not reported.
 */
export function markdownCodeBlocks(markdown: string): CodeBlockFact[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: CodeBlockFact[] = []
  let open: { char: string; length: number } | undefined
  for (let i = frontmatterLines(lines); i < lines.length; i++) {
    const line = lines[i]
    if (open) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
      if (close?.[1].startsWith(open.char) && close[1].length >= open.length)
        open = undefined
      continue
    }
    const match = OPEN_FENCE.exec(line)
    if (!match) continue
    const fence = match[1]
    const info = match[2].trim()
    // A backtick fence cannot have a backtick in its info string.
    if (fence.startsWith('`') && info.includes('`')) continue
    open = { char: fence[0], length: fence.length }
    const language = info.split(/\s+/)[0]?.toLowerCase()
    if (language) blocks.push({ language, line: i + 1 })
  }
  return blocks
}

/** Distinct languages in first-seen order. */
export function markdownCodeBlockLanguages(markdown: string): string[] {
  return [...new Set(markdownCodeBlocks(markdown).map((b) => b.language))]
}
