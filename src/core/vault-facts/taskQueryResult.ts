import type { ToolExecutionContext, ToolResult } from '../tools/localToolCommon'

import type { Note } from './noteQuery'
import type { QueryArgs } from './noteQueryArgs'
import { taskCounts } from './noteQueryFacts'
import * as modelText from './taskQueryResultText'

const cut = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s
const abort = (ctx: ToolExecutionContext) => {
  if (ctx.signal?.aborted) throw new Error(modelText.aborted())
}
export async function taskResult(
  notes: Note[],
  q: QueryArgs,
  ctx: ToolExecutionContext,
  scope: number,
  unindexed: number,
  warnings: string[],
): Promise<ToolResult> {
  const entries: { note: Note; line: number; text?: string }[] = []
  const phrase = q.text?.toLowerCase()
  for (const n of notes.sort((a, b) => a.path.localeCompare(b.path, 'ko'))) {
    const items = n.listItems
      .filter(
        (i) =>
          i.task !== undefined &&
          (q.status === 'all' ||
            (q.status === 'open' ? i.task === ' ' : i.task !== ' ')),
      )
      .sort((a, b) => a.position.start.line - b.position.start.line)
    let lines: string[] | undefined
    if (q.text && items.length) {
      abort(ctx)
      lines = (await n.read()).split(/\r?\n/)
    }
    for (const item of items) {
      const line = item.position.start.line
      const text = lines?.[line] ?? ''
      if (!phrase || text.toLowerCase().includes(phrase))
        entries.push({ note: n, line, text: lines ? text : undefined })
    }
  }
  const countNotes = new Set(entries.map((e) => e.note.path)).size
  let text = modelText.scope(
    unindexed ? modelText.unindexed(unindexed) : '',
    q.path ?? q.folder ?? modelText.all(),
    scope,
    entries.length,
    countNotes,
  )
  if (!q.offset) text += taskCounts(entries)
  if (warnings.length) text = `${warnings.join('\n')}\n${text}`
  let returned = 0,
    last = '',
    lines: string[] = []
  for (const entry of entries.slice(q.offset, q.offset + q.limit)) {
    if (entry.text === undefined && last !== entry.note.path) {
      abort(ctx)
      lines = (await entry.note.read()).split(/\r?\n/)
    }
    const row = `${last === entry.note.path ? '' : `\n${entry.note.path}`}\nL${entry.line + 1} ${cut(entry.text ?? lines[entry.line] ?? '', 300)}`
    if (text.length + row.length > 11950) break
    text += row
    last = entry.note.path
    returned++
  }
  const next =
    q.offset + returned < entries.length ? q.offset + returned : undefined
  if (next !== undefined) text += modelText.nextPage(next)
  abort(ctx)
  return {
    kind: 'read',
    text,
    facts: {
      total: entries.length,
      returned,
      ...(next !== undefined ? { nextOffset: next } : {}),
      completeness: unindexed || next !== undefined ? 'partial' : 'complete',
    },
  }
}
