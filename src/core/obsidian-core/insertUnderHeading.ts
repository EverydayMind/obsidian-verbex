import { L } from '../../i18n/modelText'
import { parseHeadings, sectionEndLine } from '../tools/noteSlicing'

export type InsertUnderHeadingResult = {
  content: string
  headingMatched: boolean
  fallbackNotice?: string
}

const EMPTY_PLACEHOLDER_RE = /^([ \t]*)([-*]\s+\[ \]|[-*])[ \t]*$/
const ANY_LIST_MARKER_RE = /^(?:[-*]\s+\[[ xX]\]\s+|[-*]\s+)/
const TASK_LINE_RE = /^\s*[-*]\s+\[[ xX]\]\s+\S/
const EMPTY_TASK_PLACEHOLDER_RE = /^[ \t]*[-*]\s+\[ \][ \t]*$/

function normalizeHeadingName(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/\s*#+\s*$/, '')
    .trim()
    .toLowerCase()
}

function fillPlaceholder(line: string, indent: string, marker: string): string {
  const prefix = `${marker} `
  const trimmed = line.trimStart()
  if (trimmed.startsWith(prefix)) return `${indent}${trimmed}`
  if (marker.length === 1 && ANY_LIST_MARKER_RE.test(trimmed))
    return `${indent}${trimmed}`
  return `${indent}${prefix}${trimmed}`
}

function findEmptyPlaceholderIndex(
  lines: readonly string[],
  from: number,
  to: number,
): number {
  let inFence = false
  for (let i = from; i < to; i += 1) {
    if (/^\s*(?:```|~~~)/.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (EMPTY_PLACEHOLDER_RE.test(lines[i])) return i
  }
  return -1
}

function joinPreservingEol(
  lines: string[],
  newline: string,
  hadTrailingNewline: boolean,
): string {
  const joined = lines.join(newline)
  return hadTrailingNewline ? `${joined}${newline}` : joined
}

/**
 * Inserts lines under the first matching Markdown heading (or at the end of
 * the note when no heading is given or the heading is not found).
 */
export function insertUnderHeading(
  text: string,
  heading: string | null | undefined,
  rawLines: readonly string[],
): InsertUnderHeadingResult {
  const lines = rawLines.flatMap((entry) =>
    entry.replace(/\r\n/g, '\n').split('\n'),
  )
  if (lines.length === 0) {
    return { content: text, headingMatched: true }
  }

  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = /\r?\n$/.test(text)
  const stripped = hadTrailingNewline ? text.replace(/\r?\n$/, '') : text
  const docLines =
    stripped.length === 0 && !hadTrailingNewline ? [] : stripped.split(/\r?\n/)

  const requestedHeading = heading?.trim() ?? ''
  if (requestedHeading) {
    const target = normalizeHeadingName(requestedHeading)
    const headings = parseHeadings(docLines)
    const matchIndex = headings.findIndex(
      (item) => normalizeHeadingName(item.heading) === target,
    )
    if (matchIndex >= 0) {
      const matched = headings[matchIndex]
      const bodyStart = matched.line
      const bodyEnd = sectionEndLine(
        headings,
        matchIndex,
        docLines.length,
        true,
      )
      const placeholderIdx = findEmptyPlaceholderIndex(
        docLines,
        bodyStart,
        bodyEnd,
      )
      if (placeholderIdx >= 0) {
        const match = EMPTY_PLACEHOLDER_RE.exec(docLines[placeholderIdx])
        if (match) {
          const filledFirst = fillPlaceholder(lines[0], match[1], match[2])
          docLines.splice(placeholderIdx, 1, filledFirst, ...lines.slice(1))
        }
      } else {
        let insertAt = bodyEnd
        while (insertAt > bodyStart && docLines[insertAt - 1].trim() === '') {
          insertAt -= 1
        }
        docLines.splice(insertAt, 0, ...lines)
      }
      return {
        content: joinPreservingEol(docLines, newline, hadTrailingNewline),
        headingMatched: true,
      }
    }
  }

  // No heading given and only tasks to add: fill the note's first empty task
  // placeholder (a template's "- [ ] " line) instead of the note's end.
  if (!requestedHeading && lines.every((line) => TASK_LINE_RE.test(line))) {
    const placeholderIdx = docLines.findIndex((line) =>
      EMPTY_TASK_PLACEHOLDER_RE.test(line),
    )
    if (placeholderIdx >= 0) {
      const match = EMPTY_PLACEHOLDER_RE.exec(docLines[placeholderIdx])
      if (match) {
        const filledFirst = fillPlaceholder(lines[0], match[1], match[2])
        docLines.splice(placeholderIdx, 1, filledFirst, ...lines.slice(1))
        return {
          content: joinPreservingEol(docLines, newline, hadTrailingNewline),
          headingMatched: true,
        }
      }
    }
  }

  while (docLines.length > 0 && docLines[docLines.length - 1].trim() === '') {
    docLines.pop()
  }
  docLines.push(...lines)
  const fallbackNotice = requestedHeading
    ? L({
        ko: `제목 '${requestedHeading}'을 찾지 못해 끝에 넣음`,
        en: `Heading '${requestedHeading}' not found; appended at the end`,
      })
    : undefined
  return {
    content: joinPreservingEol(docLines, newline, hadTrailingNewline),
    headingMatched: !requestedHeading,
    ...(fallbackNotice ? { fallbackNotice } : {}),
  }
}
