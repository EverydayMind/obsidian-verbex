import { ParsedObsidianQuery } from '../../utils/obsidian-query'

export type LineHit = {
  path: string
  line: number
  heading: string
  date: string
  preview: string
  length: number
  truncated: boolean
}

export const LINE_LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  callBytes: 8 * 1024 * 1024,
  callMs: 1500,
  targets: 20_000,
  previewChars: 300,
  ttlMs: 30 * 60_000,
  ownSessions: 4,
  sessions: 32,
  pages: 20,
}

export function lineTerms(
  value: unknown,
  parsed: ParsedObsidianQuery,
): string[] {
  const input =
    value === undefined ? [...parsed.anyTerms, ...parsed.allTerms] : value
  if (!Array.isArray(input) || input.some((term) => typeof term !== 'string'))
    throw new Error('terms')
  const terms = [
    ...new Set(
      (input as string[])
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
  if (
    !terms.length ||
    terms.length > 10 ||
    terms.some((term) => term.length > 100)
  )
    throw new Error('terms')
  return terms
}

/** Yield every body line, including misses, for cooperative deadline checks. */
export function* scanBodyLines(
  content: string,
  terms: readonly string[],
  path: string,
  date: string,
  previewChars = LINE_LIMITS.previewChars,
): Generator<LineHit | null> {
  const lines = (
    content.startsWith(String.fromCharCode(0xfeff)) ? content.slice(1) : content
  ).split(/\r?\n/)
  let start = 0
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex(
      (line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line),
    )
    if (end > 0) start = end + 1
  }
  const headings: { level: number; text: string }[] = []
  let fence: { char: string; count: number } | undefined
  for (let i = start; i < lines.length; i++) {
    const text = lines[i]
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text)
    if (marker) {
      if (!fence && !(marker[1].startsWith('`') && marker[2].includes('`')))
        fence = { char: marker[1][0], count: marker[1].length }
      else if (
        fence &&
        marker[1].startsWith(fence.char) &&
        marker[1].length >= fence.count &&
        !marker[2].trim()
      )
        fence = undefined
    } else if (!fence) {
      const heading = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/.exec(text)
      if (heading) {
        const level = heading[1].length
        while (headings.length && headings[headings.length - 1].level >= level)
          headings.pop()
        headings.push({
          level,
          text: heading[2].replace(/\s+#+\s*$/, '').trim(),
        })
      }
    }
    const lower = text.toLowerCase()
    const positions = terms
      .map((term) => lower.indexOf(term))
      .filter((at) => at >= 0)
    if (!positions.length) {
      yield null
      continue
    }
    const loweredAt = Math.min(...positions)
    // Some Unicode lower-case mappings expand (e.g. İ -> i + combining dot).
    let at = loweredAt
    if (lower.length !== text.length) {
      let offset = 0
      at = 0
      for (const character of text) {
        if (offset >= loweredAt) break
        offset += character.toLowerCase().length
        at += character.length
      }
    }
    const begin = Math.max(0, Math.min(at - 100, text.length - previewChars))
    yield {
      path,
      line: i + 1,
      heading: headings.map((h) => h.text).join(' > '),
      date,
      preview:
        text.length > previewChars
          ? text.slice(begin, begin + previewChars)
          : text,
      length: text.length,
      truncated: text.length > previewChars,
    }
  }
}
