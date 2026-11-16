import type { HierarchyJudgement } from '../dialectV2'

import { emphasize } from './emphasis'
import type { HierarchyFeature, TextRun } from './features'
import { isWS, sectionNumber, trimWS } from './markers'

export function contentOffset(
  f: HierarchyFeature,
  j: HierarchyJudgement,
): number {
  const trimmed = trimWS(f.text)
  const symbol =
    j.rule === 'R0' || j.semanticRole === '보고자' ? null : j.marker.symbol
  const token = j.rule === 'R2' ? sectionNumber(f.text) : symbol
  const rest = token ? trimWS(trimmed.slice(token.length)) : trimmed
  return [...f.text].length - [...rest].length
}
/** Source positions are code points, matching snapshot run offsets. */
export function inlineMarkdown(
  f: HierarchyFeature,
  j: HierarchyJudgement,
): string {
  let runs: TextRun[] = f.runs?.length
    ? f.runs
    : [
        {
          text: f.text,
          sizePt: f.sizePt,
          font: null,
          bold: false,
          italic: false,
        },
      ]
  const runText = runs.map((r) => r.text).join('')
  if (runText !== f.text && f.text.endsWith(runText))
    runs = [
      {
        ...runs[0],
        text: f.text.slice(0, f.text.length - runText.length),
        bold: false,
        italic: false,
      },
      ...runs,
    ]
  const chars = runs
    .flatMap((r) =>
      [...r.text].map((text) => ({ text, bold: !!r.bold, italic: !!r.italic })),
    )
    .slice(contentOffset(f, j))
  while (chars.length && !chars[chars.length - 1].text.trim()) chars.pop()
  const flattened: typeof chars = []
  for (let i = 0; i < chars.length; ) {
    if (!isWS(chars[i].text) && !/[\r\n]/.test(chars[i].text)) {
      flattened.push(chars[i++])
      continue
    }
    let end = i
    while (
      end < chars.length &&
      (isWS(chars[end].text) || /[\r\n]/.test(chars[end].text))
    )
      end++
    const span = chars.slice(i, end)
    const newline = span.find((c) => /[\r\n]/.test(c.text))
    flattened.push(...(newline ? [{ ...newline, text: ' ' }] : span))
    i = end
  }
  return emphasize(flattened, j.applicationKey.startsWith('H'))
}
