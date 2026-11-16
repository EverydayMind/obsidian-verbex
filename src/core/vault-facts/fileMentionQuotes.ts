import { hasModelMarker } from '../../i18n/modelMarkers'

import * as modelText from './fileMentionQuotesText'

export function mentionsName(text: string, name: string): boolean {
  text = text.toLowerCase()
  name = name.toLowerCase()
  let pos = text.indexOf(name)
  while (pos >= 0) {
    if (pos === 0 || !/[a-zA-Z0-9가-힣_\-.]/.test(text[pos - 1])) return true
    pos = text.indexOf(name, pos + 1)
  }
  return false
}

type QuoteLine = { number: number; text: string; header: boolean }
export type QuoteGroup = { path: string; lines: QuoteLine[]; excluded: number }

function tableText(line: string): string {
  return line.replace(/^\s*(?:>\s*)*/, '')
}

function cut(line: string, limit: number): string {
  const trimmed = line.trim()
  return trimmed.length > limit
    ? trimmed.slice(0, limit) + modelText.truncated()
    : trimmed
}

export function quoteNote(
  path: string,
  text: string,
  name: string,
): QuoteGroup {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''))
  const table: boolean[] = []
  let fence = ''
  for (const line of lines) {
    const marker = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/)
    const inside = !!fence
    if (
      marker &&
      (!fence ||
        (marker[1].startsWith(fence[0]) && marker[1].length >= fence.length))
    )
      fence = fence ? '' : marker[1]
    table.push(!inside && !marker && tableText(line).startsWith('|'))
  }
  const selected: number[] = []
  let excluded = 0
  lines.forEach((line, i) => {
    if (!mentionsName(line, name)) return
    if (hasModelMarker(line, 'systemNotice', 'any')) excluded++
    else if (selected.length < 2) selected.push(i)
  })
  const result: QuoteLine[] = []
  const headers = new Set<number>()
  for (const i of selected) {
    if (table[i]) {
      let top = i
      while (top > 0 && table[top - 1]) top--
      if (
        top !== i &&
        table[top + 1] &&
        /^[|\-:\s]+$/.test(tableText(lines[top + 1])) &&
        !headers.has(top) &&
        !selected.includes(top)
      ) {
        headers.add(top)
        if (!hasModelMarker(lines[top], 'systemNotice', 'any'))
          result.push({
            number: top + 1,
            text: cut(lines[top], 600),
            header: true,
          })
        else if (!mentionsName(lines[top], name)) excluded++
      }
    }
    result.push({
      number: i + 1,
      text: cut(lines[i], table[i] ? 600 : 300),
      header: false,
    })
  }
  return { path, lines: result, excluded }
}

const guidance = () => modelText.guidance()
const omitted = () => modelText.omitted()

function render(group: QuoteGroup): string[] {
  return [
    ...group.lines.map(
      (line) =>
        `${group.path} L${line.number}${line.header ? modelText.tableHeader() : ''}: ${line.text}`,
    ),
    ...(group.excluded ? [modelText.excluded(group.path, group.excluded)] : []),
  ]
}

export function appendQuotes(first: string, groups: QuoteGroup[]): string {
  const eligible = groups.filter(
    (group) => group.lines.length || group.excluded,
  )
  if (!eligible.some((group) => group.lines.length)) return first
  const accepted: QuoteGroup[] = []
  let skipped = false
  const output = (items: QuoteGroup[], skip: boolean) =>
    [
      first,
      guidance(),
      ...items.flatMap(render),
      ...(skip ? [omitted()] : []),
    ].join('\n')
  if (output(eligible, false).length <= 2400) return output(eligible, false)
  for (const group of eligible) {
    if (!skipped && output([...accepted, group], true).length <= 2400) {
      accepted.push(group)
      continue
    }
    skipped = true
    if (accepted.length) break
    const reduced = { ...group, lines: [...group.lines] }
    const rows = reduced.lines.filter((line) => !line.header)
    if (rows.length > 1) reduced.lines.splice(reduced.lines.indexOf(rows[1]), 1)
    if (output([reduced], true).length > 2400)
      reduced.lines = reduced.lines.filter((line) => !line.header)
    if (reduced.lines.length && output([reduced], true).length <= 2400)
      accepted.push(reduced)
    break
  }
  return accepted.length ? output(accepted, skipped) : first
}
