import {
  type App,
  type TFile,
  normalizePath,
  parseYaml,
  stringifyYaml,
} from 'obsidian'

import { coerceString } from '../../utils/coerceString'

import { splitFrontmatter } from './noteBlocks'
import { sameFileName } from './noteTitle'

export type Frontmatter = Record<string, unknown>

export function readFrontmatter(content: string): Frontmatter {
  const { yaml, hasFrontmatter } = splitFrontmatter(content)
  if (!hasFrontmatter || !yaml.trim()) return {}
  try {
    const parsed: unknown = parseYaml(yaml)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Frontmatter)
      : {}
  } catch {
    return {}
  }
}

export function bodyOf(content: string): string {
  return content.slice(splitFrontmatter(content).bodyStart)
}

/** A note from properties and a body; an empty object writes no block. */
export function composeNote(data: Frontmatter, body: string): string {
  if (Object.keys(data).length === 0) return body
  const yaml = stringifyYaml(data)
  return `---\n${yaml.endsWith('\n') ? yaml : `${yaml}\n`}---\n${body}`
}

/** Rebuild a note with new properties, keeping its body. */
export function withFrontmatter(content: string, data: Frontmatter): string {
  return composeNote(data, bodyOf(content))
}

export function aliasesOf(data: Frontmatter): string[] {
  const raw = data.aliases ?? data.alias
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return list.map((alias) => String(alias).trim()).filter(Boolean)
}

export function addAliases(data: Frontmatter, names: string[]): Frontmatter {
  const current = aliasesOf(data)
  const next = [...current]
  for (const name of names)
    if (name && !next.some((alias) => sameFileName(alias, name)))
      next.push(name)
  if (next.length === current.length) return data
  const { alias: _legacy, ...rest } = data
  return { ...rest, aliases: next }
}

/**
 * Obsidian's `insertIntoFile` merge rule, replicated for the approval preview:
 * arrays are unioned, objects merged deeply, and a non-null source scalar
 * replaces the target value.
 */
export function mergeFrontmatter(
  target: Frontmatter,
  source: Frontmatter,
): Frontmatter {
  const result: Frontmatter = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const current = result[key]
    if (!current) result[key] = value
    else if (Array.isArray(current) && Array.isArray(value))
      result[key] = [
        ...new Set([...(current as unknown[]), ...(value as unknown[])]),
      ]
    else if (
      current &&
      typeof current === 'object' &&
      value &&
      typeof value === 'object'
    )
      result[key] = mergeFrontmatter(
        current as Frontmatter,
        value as Frontmatter,
      )
    else if (value !== null) result[key] = value
  }
  return result
}

/** Scalar properties both notes set to different values. */
export function conflictingScalars(
  target: Frontmatter,
  source: Frontmatter,
): string[] {
  return Object.keys(source).filter((key) => {
    const a = target[key]
    const b = source[key]
    return (
      a !== undefined &&
      a !== null &&
      a !== '' &&
      b !== null &&
      b !== undefined &&
      typeof a !== 'object' &&
      typeof b !== 'object' &&
      coerceString(a) !== coerceString(b)
    )
  })
}

/** Preview of `insertIntoFile(target, inserted, position)` without a heading. */
export function previewInsert(
  target: string,
  inserted: string,
  position: 'append' | 'prepend',
): string {
  const targetBody = bodyOf(target)
  const insertedBody = bodyOf(inserted)
  const first = position === 'prepend' ? insertedBody : targetBody
  const second = position === 'prepend' ? targetBody : insertedBody
  let joined: string
  if (
    !first ||
    !second ||
    (first.slice(-2) + second.slice(0, 2)).includes('\n\n')
  )
    joined = first + second
  else if (first.endsWith('\n') || second.startsWith('\n'))
    joined = `${first}\n${second}`
  else joined = `${first}\n\n${second}`
  const insertedData = readFrontmatter(inserted)
  if (Object.keys(insertedData).length === 0)
    return target.slice(0, splitFrontmatter(target).bodyStart) + joined
  return composeNote(
    mergeFrontmatter(readFrontmatter(target), insertedData),
    joined,
  )
}

/** Notes whose resolved links point at `path`, with link counts. */
export function backlinkers(
  app: App,
  path: string,
): { path: string; links: number }[] {
  const resolved = app.metadataCache.resolvedLinks
  return Object.entries(resolved)
    .filter(([source, targets]) => source !== path && (targets[path] ?? 0) > 0)
    .map(([source, targets]) => ({ path: source, links: targets[path] }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

/** Subpaths (`^id`, heading text) other notes use when linking to `path`. */
export function referencedAnchors(app: App, path: string): Set<string> {
  const anchors = new Set<string>()
  for (const { path: source } of backlinkers(app, path)) {
    const file = app.vault.getFileByPath(source)
    const cache = file ? app.metadataCache.getFileCache(file) : null
    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
      const hash = link.link.indexOf('#')
      if (hash === -1) continue
      const linkpath = link.link.slice(0, hash)
      const dest = linkpath
        ? app.metadataCache.getFirstLinkpathDest(linkpath, source)
        : null
      if (dest?.path === path) anchors.add(link.link.slice(hash + 1).trim())
    }
  }
  return anchors
}

/** Existing note for an entity, matched by title or alias (case-insensitive). */
export function findEntityNote(app: App, names: string[]): TFile | null {
  const wanted = names.map((name) => name.trim()).filter(Boolean)
  const files = app.vault.getMarkdownFiles()
  const byTitle = files.find((file) =>
    wanted.some((name) => sameFileName(file.basename, name)),
  )
  if (byTitle) return byTitle
  return (
    files.find((file) => {
      const data = app.metadataCache.getFileCache(file)?.frontmatter
      return data
        ? aliasesOf(data).some((alias) =>
            wanted.some((name) => sameFileName(alias, name)),
          )
        : false
    }) ?? null
  )
}

export function folderOf(path: string): string {
  const parts = normalizePath(path).split('/')
  parts.pop()
  return parts.join('/')
}

export function joinPath(folder: string, name: string): string {
  return normalizePath(folder ? `${folder}/${name}` : name)
}

/** A same-name file in the folder, compared the Windows way. */
export function nameTaken(
  app: App,
  folder: string,
  title: string,
): string | null {
  const wanted = joinPath(folder, `${title}.md`)
  const hit = app.vault
    .getMarkdownFiles()
    .find(
      (file) =>
        folderOf(file.path) === folder && sameFileName(file.path, wanted),
    )
  return hit?.path ?? null
}

export function vaultBasePath(app: App): string | undefined {
  const adapter = app.vault.adapter as { getBasePath?: () => string }
  return typeof adapter.getBasePath === 'function'
    ? adapter.getBasePath()
    : undefined
}
