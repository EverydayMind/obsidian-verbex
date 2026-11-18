import type { ToolResult } from '../tools/localToolCommon'

import type { Note } from './noteQuery'
import type { QueryArgs } from './noteQueryArgs'
import { taskOwner } from './taskOwner'
import * as modelText from './taskOwnerText'
import { nextPage } from './taskQueryResultText'

type Entry = { note: Note; line: number; text?: string }
const cut = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s

function ownerPage(entries: Entry[], q: QueryArgs, initial: string) {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const owner = taskOwner(entry.text ?? '') ?? modelText.noOwner()
    const group = groups.get(owner) ?? []
    group.push(entry)
    groups.set(owner, group)
  }
  const ordered = [...groups].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'),
  )
  const summary = ordered
    .slice(0, 30)
    .map(([name, rows]) => `${cut(name, 80)} ${rows.length}`)
  if (ordered.length > 30)
    summary.push(modelText.moreOwners(ordered.length - 30))
  let text =
    initial + modelText.ownerGroups(ordered.length, summary.join(' · '))
  const flat = ordered.flatMap(([name, rows]) =>
    rows.map((entry) => ({ name, count: rows.length, entry })),
  )
  let returned = 0
  let last: string | undefined
  for (const { name, count, entry } of flat.slice(
    q.offset,
    q.offset + q.limit,
  )) {
    const heading = last !== name ? `\n### ${name} (${count})` : ''
    const row = `${heading}\n${entry.note.path} L${entry.line + 1} ${cut(entry.text ?? '', 300)}`
    if (returned && text.length + row.length > 11950) break
    text += row
    last = name
    returned++
  }
  return { text, returned }
}

export function ownerResult(
  entries: Entry[],
  q: QueryArgs,
  initial: string,
  unindexed: number,
): ToolResult {
  const page = ownerPage(entries, q, initial)
  const end = q.offset + page.returned
  const next = end < entries.length ? end : undefined
  return {
    kind: 'read',
    text: page.text + (next !== undefined ? nextPage(next) : ''),
    facts: {
      total: entries.length,
      returned: page.returned,
      ...(next !== undefined ? { nextOffset: next } : {}),
      completeness: unindexed || next !== undefined ? 'partial' : 'complete',
    },
  }
}
