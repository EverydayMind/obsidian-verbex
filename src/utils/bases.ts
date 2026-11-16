import { TFile } from 'obsidian'

import { stringifyUnknown } from './stringifyUnknown'

// Obsidian Bases API types (not yet in obsidian.d.ts)
export type BasesEntry = {
  file: TFile
  getProperty(id: string): unknown
}

export type BasesQueryResult = {
  entries: BasesEntry[]
  sortedEntries: BasesEntry[]
}

export type BasesViewConfig = {
  get(key: string): unknown
  getOrder(): string[]
  getDisplayName(propId: string): string
}

export type BasesViewConstructorConfig = {
  containerEl: HTMLElement
  config: BasesViewConfig
}

// Map from .base file path → latest query result as markdown text
const basesResultCache = new Map<string, string>()

export function cacheBasesResult(filePath: string, text: string): void {
  basesResultCache.set(filePath, text)
}

export function getCachedBasesResult(filePath: string): string | null {
  return basesResultCache.get(filePath) ?? null
}

export function clearBasesCache(filePath: string): void {
  basesResultCache.delete(filePath)
}

export function basesEntriesToMarkdown(
  entries: BasesEntry[],
  propOrder: string[],
): string {
  if (entries.length === 0) return '(No entries)'

  const rows = entries.map((entry) => {
    const cols = propOrder.map((prop) => {
      const val = entry.getProperty(prop)
      return val != null ? stringifyUnknown(val) : ''
    })
    return `| ${entry.file.basename} | ${cols.join(' | ')} |`
  })

  const header = `| File | ${propOrder.join(' | ')} |`
  const sep = `| --- | ${propOrder.map(() => '---').join(' | ')} |`

  return [header, sep, ...rows].join('\n')
}
