import { fmValue } from '../tools/propertyMatch'

import * as modelText from './noteQueryValuesText'

export type Note = {
  path: string
  stat: { size: number; mtime: number; ctime: number }
  frontmatter: Record<string, unknown>
  tags: string[]
  listItems: { task?: string; position: { start: { line: number } } }[]
  read: () => Promise<string>
  bodyOffset: number
  textCount?: number
}
const date = (n: number, time = false) => {
  const d = new Date(n)
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${time ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : ''}`
}
export const norm = (v: unknown): string | undefined => {
  if (v instanceof Date) return date(v.getTime())
  if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')
    return undefined
  const s = String(v).trim()
  const link = /^\[\[([^\]]+)\]\]$/.exec(s)
  return link ? (link[1].split(/[|#]/)[0].split('/').pop() ?? '').trim() : s
}
export function values(
  n: Note,
  field: string,
): { text: string; object?: true }[] {
  const parts = n.path.split('/')
  const name = parts.pop() ?? ''
  let raw: unknown
  switch (field.toLowerCase()) {
    case 'file.path':
      raw = n.path
      break
    case 'file.name':
      raw = name.replace(/\.md$/i, '')
      break
    case 'file.folder':
      raw = parts.join('/')
      break
    case 'file.top_folder':
      raw = parts[0] ?? '/'
      break
    case 'file.size':
      raw = n.stat.size
      break
    case 'file.mtime':
      raw = date(n.stat.mtime, true)
      break
    case 'file.ctime':
      raw = date(n.stat.ctime, true)
      break
    case 'tag':
      raw = n.tags
      break
    case 'tasks.open':
      raw = n.listItems.filter((i) => i.task === ' ').length
      break
    case 'tasks.done':
      raw = n.listItems.filter(
        (i) => i.task !== undefined && i.task !== ' ',
      ).length
      break
    case 'text_count':
      raw = n.textCount
      break
    default:
      raw = fmValue(n.frontmatter, field)
  }
  const result: { text: string; object?: true }[] = []
  for (const v of Array.isArray(raw) ? raw : [raw]) {
    if (v === null || v === undefined || v === '') continue
    const normalized = norm(v)
    const item =
      normalized === undefined
        ? { text: modelText.objectValue(), object: true as const }
        : { text: normalized }
    if (!result.some((x) => x.text === item.text && x.object === item.object))
      result.push(item)
  }
  return result
}
