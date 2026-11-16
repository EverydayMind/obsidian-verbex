import { App } from 'obsidian'

import { VerbexSettings } from '../../../settings/schema/setting.types'

import { documentQueue } from './extractionQueue'
import { isDocumentPath, listIndexableSources } from './indexableSources'

type SearchItem = { path: string; title?: string; companionPaths?: string[] }
/** Content identity groups files for display; imported notes remain searchable. */
export async function groupDocumentResults<T extends SearchItem>(
  app: App,
  settings: VerbexSettings,
  results: T[],
): Promise<T[]> {
  if (!settings.verbex.search.documents.enabled) return results
  const files = listIndexableSources(app, settings)
  const sourceGroups = new Map<string, string[]>()
  const hashes = new Map<string, string>()
  for (const file of files) {
    if (!isDocumentPath(file.path)) continue
    const p = await documentQueue(app).store.read(file.path)
    if (
      p?.sourceSha256 &&
      p.sourceStamp.mtime === file.stat.mtime &&
      p.sourceStamp.size === file.stat.size
    ) {
      hashes.set(file.path, p.sourceSha256)
      const paths = sourceGroups.get(p.sourceSha256) ?? []
      paths.push(file.path)
      sourceGroups.set(p.sourceSha256, paths)
    }
  }
  const imported = new Map<string, string>()
  for (const file of files) {
    if (!/\.(hwp|hwpx|pdf)\.md$/i.test(file.path)) continue
    const original = file.path.slice(0, -3)
    if (!app.vault.getFileByPath(original)) continue
    const fm = app.metadataCache.getFileCache?.(file)?.frontmatter
    const source: unknown = fm?.source ?? fm?.source_name
    if (
      typeof source === 'string' &&
      [original, original.split('/').pop()].includes(source)
    )
      imported.set(file.path, original)
  }
  const output: T[] = [],
    seen = new Map<string, T>()
  for (const result of results) {
    const source = imported.get(result.path) ?? result.path
    const hash = hashes.get(source)
    const copies = hash
      ? [...(sourceGroups.get(hash) ?? [])].sort(
          (a, b) => a.length - b.length || a.localeCompare(b),
        )
      : [source]
    const key = copies[0] ?? source
    const companions = [
      ...new Set([
        ...copies,
        ...[...imported]
          .filter(([, original]) => copies.includes(original))
          .map(([note]) => note),
      ]),
    ]
    const existing = seen.get(key)
    if (existing) {
      existing.companionPaths = [
        ...new Set([
          ...(existing.companionPaths ?? []),
          result.path,
          ...companions,
        ]),
      ].filter((p) => p !== existing.path)
      continue
    }
    const item = {
      ...result,
      ...(isDocumentPath(result.path)
        ? {
            path: key,
            title: app.vault.getFileByPath(key)?.basename ?? result.title,
          }
        : {}),
      companionPaths: companions.filter(
        (p) => p !== (isDocumentPath(result.path) ? key : result.path),
      ),
    }
    seen.set(key, item)
    output.push(item)
  }
  return output
}
