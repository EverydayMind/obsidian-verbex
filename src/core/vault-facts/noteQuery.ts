import type { Condition, QueryArgs } from './noteQueryArgs'
import { crossGroupNotes, groupAxisKeys } from './noteQueryCrossGroup'
import { norm, values } from './noteQueryValues'
import type { Note } from './noteQueryValues'
export { values } from './noteQueryValues'
export type { Note } from './noteQueryValues'

const isNumber = (s: string) =>
  /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s) && Number.isFinite(Number(s))
export function matches(n: Note, c: Condition): boolean {
  const v = values(n, c.field)
  if (c.op === 'exists') return v.length > 0
  if (c.op === 'missing') return !v.length
  const target = (norm(c.value) ?? '').toLowerCase()
  const hit = v.some((item) => {
    if (item.object) return false
    const a = item.text.trim().toLowerCase()
    const eq =
      c.field.toLowerCase() === 'tag'
        ? a === target || a.startsWith(`${target}/`)
        : a === target
    if (c.op === 'eq' || c.op === 'ne') return eq
    if (c.op === 'contains') return a.includes(target)
    const left =
      /^\d{4}-\d{2}-\d{2}$/.test(target) && /^\d{4}-\d{2}-\d{2}/.test(a)
        ? a.slice(0, 10)
        : a
    const numeric = isNumber(left) && isNumber(target)
    const cmp = numeric
      ? Number(left) - Number(target)
      : left.localeCompare(target, 'ko')
    return c.op === 'gte' ? cmp >= 0 : cmp <= 0
  })
  return c.op === 'ne' ? !hit : hit
}
export function queryNotes(notes: Note[], q: QueryArgs) {
  const found = notes.filter(
    (n) =>
      q.where.every((c) => matches(n, c)) &&
      (!q.text || (n.textCount ?? 0) > 0),
  )
  const groups = new Map<string, number>()
  if (q.group_by && !q.split_by)
    for (const n of found) {
      for (const key of groupAxisKeys(n, q.group_by, q.group_date))
        groups.set(key, (groups.get(key) ?? 0) + 1)
    }
  const crossGroups =
    q.group_by && q.split_by ? crossGroupNotes(found, q) : undefined
  const numeric = found.every((n) => {
    const v = values(n, q.sort_by)[0]?.text
    return v === undefined || isNumber(v)
  })
  found.sort((a, b) => {
    const x = values(a, q.sort_by)[0]?.text,
      y = values(b, q.sort_by)[0]?.text
    if (x === undefined || y === undefined)
      return x === y
        ? a.path.localeCompare(b.path, 'ko')
        : x === undefined
          ? 1
          : -1
    const cmp = numeric ? Number(x) - Number(y) : x.localeCompare(y, 'ko')
    return cmp
      ? cmp * (q.order === 'desc' ? -1 : 1)
      : a.path.localeCompare(b.path, 'ko')
  })
  return {
    notes: found,
    groups: [...groups].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'),
    ),
    ...(crossGroups ? { crossGroups } : {}),
    textTotal: found.reduce((sum, n) => sum + (n.textCount ?? 0), 0),
    open: found.reduce(
      (sum, n) => sum + Number(values(n, 'tasks.open')[0]?.text),
      0,
    ),
    done: found.reduce(
      (sum, n) => sum + Number(values(n, 'tasks.done')[0]?.text),
      0,
    ),
  }
}
