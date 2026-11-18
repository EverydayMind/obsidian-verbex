import type { TFile } from 'obsidian'

import { type FileSort, sortValue } from './fileListingSort'

export function fileRows(items: TFile[], sort: FileSort): string {
  return items
    .map(
      (file) =>
        `${file.path}\tformat=${file.extension}\tsize=${file.stat?.size ?? 'unknown'}B${sort === 'size' ? '' : sortValue(file, sort)}`,
    )
    .join('\n')
}
