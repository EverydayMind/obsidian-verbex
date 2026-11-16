import { DocumentProjection } from '../rag/documentSources/types'

import { ToolArgs, str } from './localToolCommon'
import { searchLines } from './noteSlicing'

export const readNumber = (
  args: ToolArgs,
  name: string,
  fallback: number,
  min = 1,
  max = 1_000_000,
) => {
  const n = args[name] === undefined ? fallback : Number(args[name])
  if (!Number.isSafeInteger(n) || n < min)
    throw new Error(`${name} must be an integer >= ${min}`)
  return Math.min(n, max)
}

export function documentReadEntries(
  p: DocumentProjection,
  lines: string[],
  tool: string,
  args: ToolArgs,
) {
  let entries: { start: number; end: number; text: string }[] = []
  if (tool === 'note_outline') {
    // Headings/locators come from extraction metadata, never reparsed Markdown.
    entries = p.chunks
      .filter((chunk) => chunk.type === 'heading')
      .map((chunk) => ({
        start: chunk.startLine,
        end: chunk.endLine,
        text: chunk.text,
      }))
    if (!entries.length)
      entries = p.chunks.map((chunk) => ({
        start: chunk.startLine,
        end: chunk.endLine,
        text: chunk.breadcrumb.join(' > ') || chunk.id,
      }))
    entries = entries.slice(readNumber(args, 'offset', 0, 0))
  } else if (tool === 'search_in_file') {
    const pattern = str(args, 'pattern')
    if (!pattern) throw new Error('search_in_file requires pattern')
    const context = readNumber(args, 'context_lines', 0, 0, 5)
    entries = searchLines(
      lines,
      pattern,
      args.case_sensitive === true,
    ).matches.map((match) => ({
      start: Math.max(1, match.line - context),
      end: Math.min(lines.length, match.line + context),
      text: '',
    }))
    entries = entries.slice(readNumber(args, 'offset', 0, 0))
  } else {
    let start = readNumber(args, 'start_line', 1),
      end = readNumber(args, 'end_line', lines.length)
    if (tool === 'read_note_around') {
      const anchor = readNumber(args, 'line', 1)
      if (anchor > lines.length) throw new Error('line past end of projection')
      start = Math.max(1, anchor - readNumber(args, 'before', 20, 0, 200))
      end = Math.min(
        lines.length,
        anchor + readNumber(args, 'after', 20, 0, 200),
      )
    }
    if (tool === 'read_note_section') {
      const heading = str(args, 'heading')
      if (!heading)
        throw new Error(
          'read_note_section requires heading (use L<startLine> from outline)',
        )
      const chunks = p.chunks.filter(
        (c) =>
          c.type === 'heading' &&
          (heading === `L${c.startLine}` ||
            c.text.trim() === heading ||
            c.breadcrumb.at(-1) === heading),
      )
      const chosen = chunks[readNumber(args, 'occurrence', 1) - 1]
      if (!chosen)
        throw new Error(
          'Section not found; request note_outline and use its L<startLine> reference',
        )
      start = chosen.startLine
      const next = p.chunks.find(
        (c) =>
          c.type === 'heading' &&
          c.startLine > start &&
          (args.include_subsections === false ||
            c.breadcrumb.length <= chosen.breadcrumb.length),
      )
      end = next ? next.startLine - 1 : lines.length
    }
    if (start > lines.length || end < start)
      throw new Error('Invalid projection line range')
    entries = Array.from(
      { length: Math.min(end, lines.length) - start + 1 },
      (_, i) => ({ start: start + i, end: start + i, text: '' }),
    )
  }

  return entries
}
