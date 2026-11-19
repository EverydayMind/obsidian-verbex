import { App, EventRef, TFile } from 'obsidian'

import { VerbexSettings } from '../../../settings/schema/setting.types'

import { hasExcludedType } from './indexableSources'

/**
 * `search.excludeTypes` is decided from Obsidian's metadata cache, and the
 * cache is refreshed a moment after the vault reports a change. An index
 * update that runs in between sees the previous frontmatter. This watcher
 * asks for the note to be indexed again when the refreshed cache flips the
 * answer: a new note that turns out to be excluded is dropped, and a note
 * whose excluded type was removed is added.
 */
export function watchTypeExclusion(
  app: App,
  getSettings: () => VerbexSettings,
  reindex: (file: TFile) => void,
): EventRef[] {
  const excludedPaths = new Set<string>()
  const isExcluded = (file: TFile) => hasExcludedType(app, file, getSettings())
  return [
    // The cache still holds the frontmatter from before this change.
    app.vault.on('modify', (file) => {
      if (!(file instanceof TFile)) return
      if (isExcluded(file)) excludedPaths.add(file.path)
      else excludedPaths.delete(file.path)
    }),
    app.vault.on('rename', (file, oldPath) => {
      if (excludedPaths.delete(oldPath)) excludedPaths.add(file.path)
    }),
    app.vault.on('delete', (file) => {
      excludedPaths.delete(file.path)
    }),
    app.metadataCache.on('changed', (file) => {
      const excluded = isExcluded(file)
      const wasExcluded = excludedPaths.has(file.path)
      if (excluded === wasExcluded) return
      if (excluded) excludedPaths.add(file.path)
      else excludedPaths.delete(file.path)
      reindex(file)
    }),
  ]
}
