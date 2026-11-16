import type { App, TFile } from 'obsidian'

import { L } from '../../i18n/modelText'
import { noteTags } from '../../utils/vault-relations'
import { tokenize } from '../rag/bm25'

const allowedKey = /^(?:aliases|alias|tags|tag|category|categories)$/i
const topicalKey = /^(?:tags|tag|category|categories)$/i
const valueExcluded =
  /(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|^www\.|^[a-f0-9]{16,}$|^\d{4}-\d{2}-\d{2}(?:T|$))/i
const normalize = (v: string) =>
  v
    .replace(/^#|^\[\[|\]\]$/g, '')
    .split('|')[0]
    .trim()
    .toLowerCase()

/** One metadata-frequency pass per iterative_search invocation. */
export function createIterativeClues(app: App) {
  const files = app.vault.getMarkdownFiles()
  const frequencies = new Map<string, number>()
  const rejected: Record<string, number> = {
    system: 0,
    value: 0,
    frequent: 0,
    unrelated: 0,
  }
  for (const file of files) {
    const fm: Record<string, unknown> =
      app.metadataCache.getFileCache(file)?.frontmatter ?? {}
    const metadata = Object.entries(fm)
      .filter(([key]) => allowedKey.test(key))
      .flatMap(([, value]) =>
        Array.isArray(value) ? (value as unknown[]) : [value],
      )
    for (const value of new Set(
      [
        ...noteTags(app, file),
        ...metadata.filter((v): v is string => typeof v === 'string'),
      ].map(normalize),
    ))
      frequencies.set(value, (frequencies.get(value) ?? 0) + 1)
  }
  const threshold = Math.max(20, files.length * 0.02)
  const accept = (
    value: string,
    topical: boolean,
    seedTokens: ReadonlySet<string>,
  ) => {
    const reason = valueExcluded.test(value.trim())
      ? 'value'
      : topical && (frequencies.get(normalize(value)) ?? 0) > threshold
        ? 'frequent'
        : topical &&
            !tokenize(value).some(
              (token) => [...token].length >= 2 && seedTokens.has(token),
            )
          ? 'unrelated'
          : null
    if (reason) rejected[reason]++
    return !reason
  }
  return {
    collect(file: TFile, seedTokens: ReadonlySet<string>): string[] {
      const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {}
      const result = noteTags(app, file).filter((v) =>
        accept(v, true, seedTokens),
      )
      for (const [key, value] of Object.entries(fm)) {
        if (!allowedKey.test(key)) {
          rejected.system++
          continue
        }
        for (const item of Array.isArray(value) ? value : [value])
          if (
            typeof item === 'string' &&
            item.trim() &&
            accept(item, topicalKey.test(key), seedTokens)
          )
            result.push(item)
      }
      return [...new Set(result)]
    },
    summary: () =>
      L({
        ko: `제외 단서 ${Object.values(rejected).reduce((a, b) => a + b, 0)}개(system=${rejected.system}, value=${rejected.value}, frequent=${rejected.frequent}, unrelated=${rejected.unrelated})`,
        en: `Excluded clues: ${Object.values(rejected).reduce((a, b) => a + b, 0)} (system=${rejected.system}, value=${rejected.value}, frequent=${rejected.frequent}, unrelated=${rejected.unrelated})`,
      }),
  }
}
