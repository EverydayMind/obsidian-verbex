import type { TFile } from 'obsidian'

import * as modelText from './fileListingSortText'
import type { ToolArgs } from './localToolCommon'

export type FileSort = 'path' | 'mtime' | 'ctime' | 'size'
export function fileSortArgs(
  args: ToolArgs,
): { sort: FileSort; order: 'asc' | 'desc' } | string {
  if (
    args.sort !== undefined &&
    (typeof args.sort !== 'string' ||
      !['path', 'mtime', 'ctime', 'size'].includes(args.sort))
  )
    return modelText.sortError()
  if (
    args.order !== undefined &&
    (typeof args.order !== 'string' || !['asc', 'desc'].includes(args.order))
  )
    return modelText.orderError()
  return {
    sort: (args.sort as FileSort | undefined) ?? 'path',
    order: (args.order as 'asc' | 'desc' | undefined) ?? 'asc',
  }
}
export function sortFiles(
  files: TFile[],
  sort: FileSort,
  order: 'asc' | 'desc',
): void {
  files.sort((a, b) => {
    const value =
      sort === 'path'
        ? a.path.localeCompare(b.path)
        : (a.stat?.[sort] ?? 0) - (b.stat?.[sort] ?? 0)
    return value
      ? value * (order === 'desc' ? -1 : 1)
      : a.path.localeCompare(b.path)
  })
}
export function sortValue(file: TFile, sort: FileSort): string {
  if (sort === 'path') return ''
  const value = file.stat?.[sort]
  if (value === undefined) return `\t${sort}=unknown`
  if (sort === 'size') return `\tsize=${value}B`
  const date = new Date(value),
    pad = (n: number) => String(n).padStart(2, '0')
  return `\t${sort}=${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
