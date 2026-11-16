import { L } from '../../i18n/modelText'

/**
 * Shared helpers for reading and slicing notes by line range or heading
 * section. Used by both the agent's Local Tools ({@link LocalToolRegistry}) and
 * the builtin MCP vault tools so the parsing logic stays in one place.
 *
 * All line numbers in the public surface are 1-based and inclusive, matching
 * what an LLM and a user naturally count from.
 */

export type ParsedHeading = {
  level: number
  heading: string
  /** 1-based line of the heading marker. */
  line: number
}

export type HeadingMatch = {
  heading: ParsedHeading
  index: number
}

export type LineMatch = {
  line: number
  text: string
  headingPath: string[]
  occurrences: number
}

export type PatternSection = {
  title: string
  startLine: number
  endLine: number
  preamble: boolean
}

export type CompiledLinePattern = {
  regex: RegExp
  usedLiteralFallback: boolean
}

export type AutoDetectedPatternSections = ReturnType<
  typeof sectionsByPattern
> & {
  effectivePattern: string
  usedAutoDetectedPattern: boolean
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const FENCE_RE = /^\s*(```|~~~)/
const MAX_PATTERN_LENGTH = 256
const MAX_MATCHED_LINE_CHARS = 10_000
export const PREAMBLE_CHAPTER_PATTERN =
  '^(?:PREAMBLE|CHAPTER\\s+(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|\\d+|[IVXLCDM]+))\\s*$'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a bounded per-line pattern. JavaScript has no regex timeout, so
 * reject the common nested-quantifier shapes that can cause catastrophic
 * backtracking instead of running attacker-controlled work on the UI thread.
 */
export function compileLinePattern(
  pattern: string,
  caseSensitive = false,
): CompiledLinePattern {
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`Pattern must contain 1-${MAX_PATTERN_LENGTH} characters.`)
  }
  if (/\([^)]*[+*][^)]*\)\s*(?:[+*]|\{\d)/.test(pattern)) {
    throw new Error('Pattern contains an unsafe nested quantifier.')
  }
  if (/\([^)]*\|[^)]*\)\s*(?:[+*]|\{\d)/.test(pattern)) {
    throw new Error('Pattern contains an unsafe quantified alternation.')
  }
  if (/\.\*[^\n]*\.\*/.test(pattern)) {
    throw new Error('Pattern contains repeated unbounded wildcards.')
  }
  const flags = caseSensitive ? 'gu' : 'giu'
  try {
    return { regex: new RegExp(pattern, flags), usedLiteralFallback: false }
  } catch {
    return {
      regex: new RegExp(escapeRegExp(pattern), flags),
      usedLiteralFallback: true,
    }
  }
}

function countLineMatches(regex: RegExp, line: string): number {
  regex.lastIndex = 0
  const bounded = line.slice(0, MAX_MATCHED_LINE_CHARS)
  let count = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(bounded)) !== null) {
    count += 1
    if (match[0].length === 0) regex.lastIndex += 1
  }
  return count
}

/** Search one note per line, returning matching lines and exact occurrence total. */
export function searchLines(
  lines: string[],
  pattern: string,
  caseSensitive = false,
): {
  matches: LineMatch[]
  usedLiteralFallback: boolean
  totalMatches: number
} {
  const compiled = compileLinePattern(pattern, caseSensitive)
  const headings = parseHeadings(lines)
  const matches: LineMatch[] = []
  let totalMatches = 0
  lines.forEach((text, index) => {
    const occurrences = countLineMatches(compiled.regex, text)
    if (occurrences === 0) return
    totalMatches += occurrences
    matches.push({
      line: index + 1,
      text,
      headingPath: headingPathForLine(headings, index + 1),
      occurrences,
    })
  })
  return {
    matches,
    usedLiteralFallback: compiled.usedLiteralFallback,
    totalMatches,
  }
}

/** Build sections whose first line matches a per-line pattern. */
export function sectionsByPattern(
  lines: string[],
  pattern: string,
  caseSensitive = false,
): { sections: PatternSection[]; usedLiteralFallback: boolean } {
  const compiled = compileLinePattern(pattern, caseSensitive)
  const starts: number[] = []
  lines.forEach((line, index) => {
    if (countLineMatches(compiled.regex, line) > 0) starts.push(index + 1)
  })
  const sections: PatternSection[] = []
  if (starts.length > 0 && starts[0] > 1) {
    sections.push({
      title: L({
        ko: '(전문/서문 — 첫 매치 이전)',
        en: '(Preamble/preface — before the first match)',
      }),
      startLine: 1,
      endLine: starts[0] - 1,
      preamble: true,
    })
  }
  starts.forEach((startLine, index) => {
    sections.push({
      title: lines[startLine - 1]?.trim() || `(line ${startLine})`,
      startLine,
      endLine: (starts[index + 1] ?? lines.length + 1) - 1,
      preamble: false,
    })
  })
  return { sections, usedLiteralFallback: compiled.usedLiteralFallback }
}

/**
 * Recognize common document-level boundaries when a small model supplies a
 * zero-match pattern. Prefer chapter markers over Article markers so a request
 * to split by chapter does not accidentally create hundreds of article files.
 */
export function detectCommonSectionPattern(lines: string[]): string | null {
  const candidates = [
    PREAMBLE_CHAPTER_PATTERN,
    '^제\\s*\\d+\\s*장(?:\\s*[:：-].*)?$',
    '^Article\\s+\\d+(?:\\.\\d+)*(?:\\s*[:：-].*)?$',
  ]
  for (const pattern of candidates) {
    const compiled = compileLinePattern(pattern)
    if (lines.some((line) => countLineMatches(compiled.regex, line) > 0)) {
      return pattern
    }
  }
  return null
}

export function sectionsByPatternWithAutoFallback(
  lines: string[],
  pattern: string,
  caseSensitive = false,
): AutoDetectedPatternSections {
  const requested = sectionsByPattern(lines, pattern, caseSensitive)
  if (requested.sections.length > 0) {
    return {
      ...requested,
      effectivePattern: pattern,
      usedAutoDetectedPattern: false,
    }
  }
  const detected = detectCommonSectionPattern(lines)
  if (!detected) {
    return {
      ...requested,
      effectivePattern: pattern,
      usedAutoDetectedPattern: false,
    }
  }
  return {
    ...sectionsByPattern(lines, detected),
    effectivePattern: detected,
    usedAutoDetectedPattern: true,
  }
}

export function splitLines(content: string): string[] {
  return content.split(/\r?\n/)
}

/**
 * Parse ATX headings from raw lines, ignoring `#` inside fenced code blocks and
 * the YAML frontmatter block. Self-contained (does not depend on the metadata
 * cache being populated) so it works in tests and on freshly created notes.
 */
export function parseHeadings(lines: string[]): ParsedHeading[] {
  const headings: ParsedHeading[] = []
  let inFence = false
  let i = 0
  // Skip a leading YAML frontmatter block.
  if (lines[0] === '---') {
    for (i = 1; i < lines.length; i++) {
      if (lines[i] === '---' || lines[i] === '...') {
        i++
        break
      }
    }
  }
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = HEADING_RE.exec(line)
    if (m) {
      headings.push({
        level: m[1].length,
        heading: m[2].trim(),
        line: i + 1,
      })
    }
  }
  return headings
}

/** Match heading text using the same case-insensitive rules as read_note_section. */
export function matchHeadingOccurrences(
  headings: ParsedHeading[],
  headingArg: string,
): HeadingMatch[] {
  const target = headingArg.replace(/^#+\s*/, '').toLowerCase()
  return headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => heading.heading.toLowerCase() === target)
}

/** Select one 1-based heading occurrence after callers validate ambiguity policy. */
export function selectHeadingOccurrence(
  matches: HeadingMatch[],
  occurrence: number,
): HeadingMatch | null {
  if (!Number.isInteger(occurrence) || occurrence < 1) return null
  return matches[occurrence - 1] ?? null
}

export function availableHeadingNames(
  headings: ParsedHeading[],
  limit = 40,
): string[] {
  return headings.slice(0, limit).map((heading) => heading.heading)
}

/**
 * End line (1-based, inclusive) of the section opened by `headings[index]`: the
 * line just before the next heading whose level is <= the start level (or, when
 * subsections are excluded, before the next heading of any level). Defaults to
 * the end of the file.
 */
export function sectionEndLine(
  headings: ParsedHeading[],
  index: number,
  totalLines: number,
  includeSubsections: boolean,
): number {
  const startLevel = headings[index].level
  for (let j = index + 1; j < headings.length; j++) {
    const boundary = includeSubsections ? headings[j].level <= startLevel : true
    if (boundary) {
      return headings[j].line - 1
    }
  }
  return totalLines
}

/** Breadcrumb of enclosing headings for a 1-based line, e.g. ["Ch 3", "Art 3.4"]. */
export function headingPathForLine(
  headings: ParsedHeading[],
  line: number,
): string[] {
  const stack: ParsedHeading[] = []
  for (const h of headings) {
    if (h.line > line) break
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop()
    }
    stack.push(h)
  }
  return stack.map((h) => h.heading)
}

/** Render a 1-based inclusive line range, optionally prefixing line numbers. */
export function renderLines(
  lines: string[],
  start: number,
  end: number,
  includeLineNumbers: boolean,
): string {
  const out: string[] = []
  for (let n = start; n <= end; n++) {
    const text = lines[n - 1] ?? ''
    out.push(includeLineNumbers ? `${n}: ${text}` : text)
  }
  return out.join('\n')
}
