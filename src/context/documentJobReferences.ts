import type { App } from 'obsidian'

import {
  buildVaultFileMentionIndex,
  scanTextForVaultFileMentions,
} from '../utils/chat/fileMentions'

import { QUOTED_SPAN_RE } from './quotedSpans'

export type DocumentJobReferenceSource = 'explicit' | 'current_file'
export type ReferencedHwp =
  | { path: string; source: DocumentJobReferenceSource }
  | 'none'
  | 'multiple'
  | 'uncertain'

export function isDecompositionMarkdown(app: App, path: string): boolean {
  if (!/\.md$/i.test(path)) return false
  const file = app.vault.getFileByPath(path)
  const id: unknown =
    file &&
    app.metadataCache?.getFileCache(file)?.frontmatter?.['hwpx-decomposition']
  return typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)
}

/** Vault paths are case-sensitive; slash and dot aliases share one identity. */
function canonical(path: string): string {
  const parts: string[] = []
  for (const part of path.trim().replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return ''
      parts.pop()
    } else parts.push(part)
  }
  return parts.join('/')
}

/** Unbounded reference census, independent of the five-document prompt cap. */
export function documentJobReferences(
  app: App,
  request: string,
  currentFile?: { path: string } | null,
  mentionables: readonly unknown[] = [],
): ReferencedHwp {
  const files = app.vault.getFiles()
  const byPath = new Map(files.map((file) => [canonical(file.path), file]))
  const index = buildVaultFileMentionIndex(files)
  const quotes = [
    ...request.matchAll(
      new RegExp(
        QUOTED_SPAN_RE.source.replace(/\{2,200\}/g, '{1,}'),
        QUOTED_SPAN_RE.flags,
      ),
    ),
  ]
  const unquoted = request.split('')
  for (const quote of quotes)
    unquoted.fill(' ', quote.index, quote.index + quote[0].length)
  const text = unquoted.join('')
  const mentions = scanTextForVaultFileMentions(text, index)
  const found = new Set<string>()
  let explicit = mentions.length > 0
  let uncertain = false
  const add = (raw: string) => {
    const file = byPath.get(canonical(raw))
    if (!file) uncertain = true
    else if (
      /\.hwpx?$/i.test(file.path) ||
      isDecompositionMarkdown(app, file.path)
    )
      found.add(file.path)
  }
  for (const mention of mentions) add(mention.path)
  // An unresolved or ambiguous extension-bearing reference cannot disappear.
  for (const match of text.matchAll(/\.[a-z][a-z0-9]{0,9}(?=$|[^a-z0-9])/gi)) {
    explicit = true
    if (!/^\.hwpx?$/i.test(match[0])) continue
    const end = match.index + match[0].length
    const mention = mentions.find((item) => item.end === end)
    if (!mention || /[/\\]/.test(text[mention.start - 1] ?? ''))
      uncertain = true
  }
  for (const match of quotes) {
    const value = match
      .slice(1)
      .find((part) => part !== undefined)
      ?.trim()
    if (!value) continue
    const exact = byPath.get(canonical(value))
    const named = files.filter(
      (file) => file.name === value || file.basename === value,
    )
    // No file, path or extension: a title or search string, not a reference.
    if (!exact && !named.length && !/[/\\]|\.[a-z][a-z0-9]{0,9}$/i.test(value))
      continue
    explicit = true
    if (exact) add(exact.path)
    else if (named.length === 1) add(named[0].path)
    else uncertain = true
  }
  for (const item of mentionables) {
    const mention = item as { type?: string; file?: { path?: unknown } } | null
    if (mention?.type === 'current-file') continue
    if (typeof mention?.file?.path !== 'string') continue
    explicit = true
    add(mention.file.path)
  }
  if (!explicit && currentFile) add(currentFile.path)
  if (uncertain) return 'uncertain'
  return found.size > 1
    ? 'multiple'
    : found.size
      ? { path: [...found][0], source: explicit ? 'explicit' : 'current_file' }
      : 'none'
}
