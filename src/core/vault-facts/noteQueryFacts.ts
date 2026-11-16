import type { QueryArgs } from './noteQueryArgs'
import * as modelText from './noteQueryFactsText'
import { type Note, values } from './noteQueryValues'

const reserved = [
  'path',
  'name',
  'folder',
  'top_folder',
  'mtime',
  'ctime',
  'size',
]
const builtins = [
  ...reserved.map((name) => `file.${name}`),
  'tag',
  'tasks.open',
  'tasks.done',
  'text_count',
]
const frontmatter = (field: string) => !builtins.includes(field.toLowerCase())
const hint = (field: string) =>
  reserved.includes(field.toLowerCase())
    ? modelText.hint(field.toLowerCase())
    : modelText.reserved(builtins.join(', '))

export function missingFieldFacts(
  notes: Note[],
  q: QueryArgs,
  tasks: boolean,
): string[] {
  if (!tasks)
    for (const field of [q.sort_by, q.group_by]) {
      if (
        field &&
        frontmatter(field) &&
        !notes.some((n) => values(n, field).length)
      )
        throw new Error(
          modelText.missingSortProperty(field, notes.length, hint(field)),
        )
    }
  return [...new Set(q.where.map((c) => c.field))]
    .filter(
      (field) =>
        frontmatter(field) && !notes.some((n) => values(n, field).length),
    )
    .map((field) =>
      modelText.missingProperty(
        field,
        reserved.includes(field.toLowerCase()) ? ` ${hint(field)}` : '',
      ),
    )
}

export function displayFields(q: QueryArgs): string[] {
  const fields = [...q.fields]
  for (const field of [
    q.sort_by.toLowerCase() === 'file.path' ? undefined : q.sort_by,
    q.text ? 'text_count' : undefined,
  ])
    if (field && !fields.some((f) => f.toLowerCase() === field.toLowerCase()))
      fields.push(field)
  return fields
}

export function tieFact(notes: Note[], q: QueryArgs, returned: number): string {
  const end = q.offset + returned
  if (!returned || end >= notes.length) return ''
  const value = values(notes[end - 1], q.sort_by)[0]?.text
  const numeric = notes.every((n) => {
    const v = values(n, q.sort_by)[0]?.text
    return (
      v === undefined ||
      (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(v) && Number.isFinite(Number(v)))
    )
  })
  let count = 0
  for (const note of notes.slice(end)) {
    const other = values(note, q.sort_by)[0]?.text
    const equal =
      value === undefined || other === undefined
        ? value === other
        : numeric
          ? Number(value) === Number(other)
          : value.localeCompare(other, 'ko') === 0
    if (!equal) break
    count++
  }
  const shown =
    value === undefined
      ? modelText.noValue()
      : value.length > 120
        ? `${value.slice(0, 119)}…`
        : value
  return count ? modelText.tie(shown, count) : ''
}

export function taskCounts(entries: { note: Note }[]): string {
  const counts = new Map<string, number>()
  for (const { note } of entries)
    counts.set(note.path, (counts.get(note.path) ?? 0) + 1)
  const rows = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, 10)
  return modelText.taskCounts(
    counts.size,
    rows.map(([path, count]) => `\n${path}\t${count}`).join(''),
  )
}
