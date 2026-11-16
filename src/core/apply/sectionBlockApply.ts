import type { App, TFile } from 'obsidian'

import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import type { ProposedChange } from '../../verbex/types'

export const OMISSION_MARKERS = [
  '<!-- ... existing content ... -->',
  '<!-- ...existing content... -->',
  '<!-- existing content -->',
  '<!-- 기존 내용 -->',
  '<!-- ... 기존 내용 ... -->',
  '<!-- 기존 내용 생략 -->',
] as const

type Heading = { line: number; level: number; heading: string }
const isMarker = (line: string) =>
  (OMISSION_MARKERS as readonly string[]).includes(line.trim())

function headings(lines: string[]): Heading[] {
  const result: Heading[] = []
  let fence = ''
  let comment = false
  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (!comment && fenceMatch) {
      const token = fenceMatch[1]
      if (!fence) fence = token
      else if (token.startsWith(fence[0]) && token.length >= fence.length)
        fence = ''
      return
    }
    if (fence) return
    let visible = ''
    let rest = line
    while (rest) {
      if (comment) {
        const end = rest.indexOf('-->')
        if (end < 0) break
        comment = false
        rest = rest.slice(end + 3)
      } else {
        const start = rest.indexOf('<!--')
        if (start < 0) {
          visible += rest
          break
        }
        visible += rest.slice(0, start)
        comment = true
        rest = rest.slice(start + 4)
      }
    }
    const match = visible.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/)
    if (match)
      result.push({ line: index, level: match[1].length, heading: match[2] })
  })
  return result
}

export function suggestSectionHeading(
  block: string,
  targetSource: string,
): string | undefined {
  const first = headings(block.split(/\r?\n/))[0]
  if (!first) return undefined
  const matches = headings(targetSource.split(/\r?\n/)).filter(
    (h) => h.level === first.level && h.heading === first.heading,
  )
  return matches.length === 1 ? first.heading : undefined
}

export function resolveBoundedSectionBlock(
  block: string,
  targetSource: string,
):
  | {
      heading: string
      level: number
      startLine: number
      endLine: number
      newSectionText: string
    }
  | { ambiguous: string } {
  const lines = block.split(/\r?\n/)
  const first = lines.findIndex((line) => line.trim())
  let last = lines.length - 1
  while (last >= 0 && !lines[last].trim()) last--
  if (first < 0 || (!isMarker(lines[first]) && !isMarker(lines[last])))
    return { ambiguous: 'missing_boundary' }
  const hs = headings(lines)
  const head = hs[0]
  if (
    !head ||
    lines.slice(first, head.line).some((line) => line.trim() && !isMarker(line))
  )
    return { ambiguous: 'missing_section' }
  const next = hs.find((h) => h.line > head.line && h.level <= head.level)
  let end = next?.line ?? lines.length
  while (
    end > head.line + 1 &&
    (!lines[end - 1].trim() || (!next && isMarker(lines[end - 1])))
  )
    end--
  if (lines.slice(head.line, end).some(isMarker))
    return { ambiguous: 'internal_omission' }
  if (
    lines
      .slice(end)
      .some(
        (line, i) =>
          line.trim() && !isMarker(line) && !hs.some((h) => h.line === end + i),
      )
  )
    return { ambiguous: 'multiple_sections' }
  const targetLines = targetSource.split(/\r?\n/)
  const targetHeadings = headings(targetLines)
  const matches = targetHeadings.filter(
    (h) => h.level === head.level && h.heading === head.heading,
  )
  if (matches.length !== 1) return { ambiguous: 'target_heading' }
  const startLine = matches[0].line
  const endLine =
    targetHeadings.find((h) => h.line > startLine && h.level <= head.level)
      ?.line ?? targetLines.length
  return {
    heading: head.heading,
    level: head.level,
    startLine,
    endLine,
    newSectionText: lines.slice(head.line, end).join('\n'),
  }
}

export function resolveApplyFile(app: App, filename?: string): TFile | null {
  if (!filename) return null
  try {
    const path = assertUserVaultPath(app, filename)
    if (path.split('/')[0].toLowerCase() === '.verbex' || !path.endsWith('.md'))
      return null
    return (
      app.vault.getMarkdownFiles().find((file) => file.path === path) ?? null
    )
  } catch {
    return null
  }
}

export function sectionChange(
  path: string,
  before: string,
  section: Exclude<
    ReturnType<typeof resolveBoundedSectionBlock>,
    { ambiguous: string }
  >,
): ProposedChange {
  const newline = before.includes('\r\n') ? '\r\n' : '\n'
  const lines = before.split(/\r?\n/)
  const replacement = section.newSectionText.split('\n')
  // Keep the target section's trailing blank lines so the next heading keeps its spacing.
  let trailing = 0
  for (
    let i = section.endLine - 1;
    i > section.startLine && !lines[i]?.trim();
    i--
  )
    trailing++
  while (trailing-- > 0) replacement.push('')
  const after = [
    ...lines.slice(0, section.startLine),
    ...replacement,
    ...lines.slice(section.endLine),
  ].join(newline)
  return {
    id: `update_file:${path}`,
    op: 'modify',
    kind: 'body',
    path,
    before,
    after,
    dangerous: false,
    tool: 'update_file',
  }
}
