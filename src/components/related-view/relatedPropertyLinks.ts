import type { App } from 'obsidian'

import { extractRelatedFrontmatterReferences } from '../../core/rag/relatedNotes'

import { assignHues } from './relatedColorSlots'
import type { RelatedGraphPropertyLinks } from './relatedGraphLayout'

/**
 * Property (frontmatter field) names through which `sourcePath` references
 * other notes, keyed by the referenced note's path. Uses the same field
 * reading as the related-notes graph discovery, so a reference that put a
 * note in the graph is also found here.
 */
export function propertyLinksFrom(
  app: App,
  sourcePath: string,
): Record<string, string[]> {
  const file = app.vault.getFileByPath(sourcePath)
  const frontmatter = file
    ? app.metadataCache.getFileCache(file)?.frontmatter
    : undefined
  const links: Record<string, string[]> = {}
  if (!frontmatter) return links
  for (const [field, value] of Object.entries(frontmatter)) {
    for (const target of extractRelatedFrontmatterReferences(value, field)) {
      // Obsidian's own resolution, so a property that points at a document
      // (hwpx, pdf) is found as well as one that points at a note.
      const targetPath = app.metadataCache.getFirstLinkpathDest(
        target.split('#')[0].trim(),
        sourcePath,
      )?.path
      if (!targetPath || targetPath === sourcePath) continue
      const names = (links[targetPath] ??= [])
      if (!names.includes(field)) names.push(field)
    }
  }
  return links
}

/**
 * Property names on the arrows around `centerPath`: the centre's own
 * properties for outgoing arrows, and each candidate's properties that point
 * at the centre for incoming arrows.
 */
export function collectPropertyLinks(
  app: App,
  centerPath: string,
  candidatePaths: readonly string[],
): RelatedGraphPropertyLinks {
  const incoming: Record<string, string[]> = {}
  for (const path of candidatePaths) {
    const names = propertyLinksFrom(app, path)[centerPath]
    if (names?.length) incoming[path] = names
  }
  return { incoming, outgoing: propertyLinksFrom(app, centerPath) }
}

/** The note's `type` property (first value of a list), or null. */
export function noteTypeOf(app: App, path: string): string | null {
  const file = app.vault.getFileByPath(path)
  const value: unknown = file
    ? app.metadataCache.getFileCache(file)?.frontmatter?.type
    : undefined
  const first: unknown = Array.isArray(value) ? value[0] : value
  if (typeof first !== 'string' && typeof first !== 'number') return null
  const text = String(first).trim()
  return text ? text : null
}

/** Hue per `type` value found in the vault's notes. */
export function noteTypeHues(app: App): Map<string, number> {
  const types = new Set<string>()
  for (const file of app.vault.getMarkdownFiles?.() ?? []) {
    const type = noteTypeOf(app, file.path)
    if (type !== null) types.add(type)
  }
  return assignHues(types)
}
