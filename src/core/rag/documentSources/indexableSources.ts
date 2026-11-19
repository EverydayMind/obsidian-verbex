import { minimatch } from 'minimatch'
import { App, CachedMetadata, TFile } from 'obsidian'

import { isAiPrivatePath } from '../../../security/aiPrivatePaths'
import { VerbexSettings } from '../../../settings/schema/setting.types'

import { DEFAULT_DOCUMENT_SETTINGS } from './types'

export function documentSettings(settings?: VerbexSettings) {
  return settings?.verbex.search.documents ?? DEFAULT_DOCUMENT_SETTINGS
}

export function isDocumentPath(path: string): boolean {
  return /\.(hwp|hwpx|pdf)$/i.test(path)
}

export function matchesSourcePattern(path: string, pattern: string): boolean {
  const clean = pattern.trim().replace(/\\/g, '/').replace(/\/$/, '')
  return (
    !!clean &&
    (path === clean || path.startsWith(`${clean}/`) || minimatch(path, clean))
  )
}

type SourceFile = Pick<TFile, 'path' | 'extension'>
// The cache looks a note up by its path, so a path is enough to ask.
type MetadataSource = {
  metadataCache?: {
    getFileCache?(file: SourceFile): CachedMetadata | null
  }
}

/**
 * True when the note's frontmatter `type` is one the user keeps out of the
 * indexes (`search.excludeTypes`). Reads Obsidian's metadata cache, which can
 * trail a file change by a moment; `typeExclusionWatcher` re-evaluates the
 * note once the cache has caught up.
 */
export function hasExcludedType(
  app: MetadataSource | undefined,
  file: Pick<TFile, 'path' | 'extension'>,
  settings?: VerbexSettings,
): boolean {
  if (file.extension !== 'md') return false
  const excluded = (settings?.verbex.search.excludeTypes ?? [])
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean)
  if (excluded.length === 0) return false
  const value: unknown =
    app?.metadataCache?.getFileCache?.(file)?.frontmatter?.type
  return (Array.isArray(value) ? value : [value]).some(
    (type) =>
      (typeof type === 'string' || typeof type === 'number') &&
      excluded.includes(String(type).trim().toLowerCase()),
  )
}

export function shouldIndexSource(
  file: Pick<TFile, 'path' | 'extension'>,
  settings?: VerbexSettings,
  embed = false,
  app?: MetadataSource,
): boolean {
  const path = file.path
  if (isAiPrivatePath(path)) return false
  if (hasExcludedType(app, file, settings)) return false
  if (
    path.split('/').some((part) => part.startsWith('.')) ||
    /^Verbex(?:\/|$)/.test(path)
  )
    return false
  const docs = documentSettings(settings)
  const binary = isDocumentPath(path)
  if (
    file.extension !== 'md' &&
    !(
      binary &&
      docs.enabled &&
      Object.entries(docs.formats).some(
        ([extension, enabled]) =>
          enabled && extension === file.extension.toLowerCase(),
      ) &&
      (!embed ||
        (docs.embed && docs.embedConsentModelId === settings?.embeddingModelId))
    )
  )
    return false
  const excluded = [
    ...(settings?.verbex.search.excludePaths ?? []),
    ...(settings?.ragOptions.excludePatterns ?? []),
    ...(binary ? docs.excludePaths : []),
  ]
  if (excluded.some((p) => matchesSourcePattern(path, p))) return false
  for (const patterns of [
    settings?.ragOptions.includePatterns ?? [],
    binary ? docs.includePaths : [],
  ]) {
    if (patterns.length && !patterns.some((p) => matchesSourcePattern(path, p)))
      return false
  }
  return true
}

export function listIndexableSources(
  app: App,
  settings?: VerbexSettings,
  embed = false,
): TFile[] {
  const files = documentSettings(settings).enabled
    ? app.vault.getFiles()
    : app.vault.getMarkdownFiles()
  return files.filter((file) => shouldIndexSource(file, settings, embed, app))
}

export function listDocumentSources(
  app: App,
  settings?: VerbexSettings,
): TFile[] {
  return listIndexableSources(app, settings).filter((file) =>
    isDocumentPath(file.path),
  )
}

export async function isGeneratedSidecar(
  app: App,
  file: TFile,
  settings?: VerbexSettings,
): Promise<boolean> {
  if (
    !documentSettings(settings).enabled ||
    !/\.(hwp|hwpx)\.index\.md$/i.test(file.path)
  )
    return false
  if (!app.vault.getFileByPath(file.path.slice(0, -9))) return false
  const firstLine = (await app.vault.cachedRead(file)).split(/\r?\n/, 1)[0]
  return /^<!-- (?:hwp-hands|hwp-editor):index:v2 sha256=[a-f0-9]{64} -->$/.test(
    firstLine,
  )
}
