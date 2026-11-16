import { tokenize } from '../core/rag/bm25'
import {
  parseHeadings,
  sectionEndLine,
  splitLines,
} from '../core/tools/noteSlicing'
import { estimateTokens } from '../utils/llm/estimateTokens'

export function boundSourceText(text: string, budget: number): string {
  let low = 0,
    high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (estimateTokens(text.slice(0, mid)) <= budget) low = mid
    else high = mid - 1
  }
  return text.slice(0, low)
}

/** Extract exact, non-overlapping source windows; offsets refer to original text. */
export function sourceExcerpt(
  content: string,
  query: string,
  maxChars: number,
  baseLine = 1,
): string {
  if (!content.trim() || maxChars < 40) return ''
  const terms = [...new Set(tokenize(query))]
  const lines = content.split('\n')
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }
  const scored = lines
    .map((line, index) => {
      const lower = line.toLowerCase()
      const hits = terms.filter((term) => lower.includes(term))
      return {
        index,
        score: hits.length,
        hit: hits.length ? Math.min(...hits.map((t) => lower.indexOf(t))) : 0,
      }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const chosen: typeof scored = []
  for (const row of scored) {
    if (chosen.every((other) => Math.abs(other.index - row.index) > 4))
      chosen.push(row)
    if (chosen.length === 3) break
  }
  if (!chosen.length) chosen.push({ index: 0, score: 0, hit: 0 })
  chosen.splice(Math.max(1, Math.min(3, Math.floor(maxChars / 120))))
  const tableStarts = new Set<number>()
  for (const row of chosen) {
    if (!/^\s*\|/.test(lines[row.index])) continue
    let first = row.index
    while (first > 0 && /^\s*\|/.test(lines[first - 1])) first--
    if (
      first < row.index &&
      /^\s*\|?[\s:|-]+\|\s*$/.test(lines[first + 1] ?? '')
    )
      tableStarts.add(first)
  }
  const windows: { start: number; end: number; label: string }[] = []
  const capacity = Math.max(
    1,
    Math.floor(
      (maxChars - (chosen.length + tableStarts.size) * 70) /
        (chosen.length + tableStarts.size),
    ),
  )
  for (const first of tableStarts) {
    const start = offsets[first],
      end = offsets[first + 2] - 1
    // Never manufacture a shortened table header. The reading tools can fetch a larger one.
    if (end - start <= capacity)
      windows.push({
        start,
        end,
        label: `[L${first + 1}-${first + 2}; offsets ${start}-${end}]`,
      })
  }
  for (const row of chosen) {
    const lineStart = offsets[row.index]
    const start = Math.max(
      offsets[Math.max(0, row.index - 1)],
      lineStart + row.hit - Math.floor(capacity / 4),
    )
    const end = Math.min(
      content.length,
      start + capacity,
      offsets[row.index + 3] ?? content.length,
    )
    const startLine = offsets.filter((n) => n <= start).length
    const endLine = offsets.filter((n) => n < end).length
    if (windows.some((w) => w.start <= start && w.end >= end)) continue
    windows.push({
      start,
      end,
      label: `[L${startLine}-${endLine}; offsets ${start}-${end}]`,
    })
  }
  const merged: typeof windows = []
  for (const window of windows.sort((a, b) => a.start - b.start)) {
    const prior = merged.at(-1)
    if (prior && prior.end >= window.start)
      prior.end = Math.max(prior.end, window.end)
    else merged.push({ ...window })
  }
  return merged
    .map((w) => {
      const first = baseLine - 1 + offsets.filter((n) => n <= w.start).length
      const last = baseLine - 1 + offsets.filter((n) => n < w.end).length
      return `[L${first}-${last}; ${baseLine > 1 ? 'chunk ' : ''}offsets ${w.start}-${w.end}]\n${content.slice(w.start, w.end)}`
    })
    .join('\n…\n')
}

function budgetedExcerpt(
  content: string,
  query: string,
  budget: number,
): string {
  for (let chars = 2400; chars >= 120; chars = Math.floor(chars * 0.75)) {
    const text = sourceExcerpt(content, query, chars)
    if (estimateTokens(text) <= budget) return text
  }
  return ''
}

/** Outline and excerpts share one budget even for a partial question. */
export function currentSourceSnippet(
  content: string,
  query: string,
  mode: string,
  tokenBudget: number,
): string {
  if (mode !== 'snippet' && estimateTokens(content) <= tokenBudget)
    return content
  const lines = splitLines(content)
  const headings = parseHeadings(lines)
  const notice =
    '[Current note body omitted: partial excerpts only. Use note_outline/read_note_section/read_note_lines for additional ranges.]'
  const structure: string[] = []
  const ranked = headings
    .map((heading, index) => ({
      heading,
      index,
      score: tokenize(query).filter((term) =>
        heading.heading.toLowerCase().includes(term),
      ).length,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const outlineBudget = Math.max(
    0,
    Math.floor(tokenBudget * 0.4) - estimateTokens(notice),
  )
  for (const { heading, index } of ranked.slice(0, 80)) {
    const end = sectionEndLine(headings, index, lines.length, true)
    const row = `- L${heading.line} ${'#'.repeat(heading.level)} ${heading.heading} — lines ${heading.line}-${end}`
    if (estimateTokens([...structure, row].join('\n')) > outlineBudget) continue
    structure.push(row)
  }
  const header = `${notice}\n## Current Note Structure\n${structure.join('\n')}\n## Query-Relevant Excerpt\n`
  const available = Math.max(0, tokenBudget - estimateTokens(header))
  return estimateTokens(header) <= tokenBudget
    ? header + budgetedExcerpt(content, query, available)
    : boundSourceText(notice, tokenBudget)
}
