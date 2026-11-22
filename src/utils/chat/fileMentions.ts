import { App, TFile, normalizePath } from 'obsidian'

export type VaultFileMention = {
  displayText: string
  path: string
  start: number
  end: number
}

export type VaultFileMentionIndex = {
  byPath: Map<string, TFile>
  uniqueByName: Map<string, TFile>
  ambiguousNames: Set<string>
  extensions: Set<string>
  maxCandidateLength: number
}

const indexCache = new WeakMap<App, VaultFileMentionIndex>()
const TEXT_NODE = 3
const SHOW_TEXT = 4
const FILE_EXTENSION_RE = /\.([A-Za-z0-9_-]+)/g
const CANDIDATE_BOUNDARY_RE = /[\s()[\]{}<>"'`.,;:!?|]/
const EXCLUDED_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

/**
 * Returns the current vault file index. The index contains names and paths
 * only; no file bodies are read.
 */
export function getVaultFileMentionIndex(app: App): VaultFileMentionIndex {
  const cached = indexCache.get(app)
  if (cached) return cached

  const vault = app.vault as App['vault'] & {
    getFiles?: () => TFile[]
  }
  const files = vault.getFiles?.() ?? vault.getMarkdownFiles()
  const index = buildVaultFileMentionIndex(files)
  indexCache.set(app, index)
  return index
}

/** Invalidates the lazy index after a vault path/name change. */
export function invalidateVaultFileMentionIndex(app: App): void {
  indexCache.delete(app)
}

export function buildVaultFileMentionIndex(
  files: TFile[],
): VaultFileMentionIndex {
  const byPath = new Map<string, TFile>()
  const filesByName = new Map<string, TFile[]>()
  const extensions = new Set<string>()
  let maxCandidateLength = 0

  for (const file of files) {
    const path = normalizeVaultPath(file.path)
    const name = file.name ?? path.split('/').pop() ?? path

    byPath.set(path, file)
    const sameName = filesByName.get(name) ?? []
    sameName.push(file)
    filesByName.set(name, sameName)

    const extension = String(file.extension ?? '').toLowerCase()
    if (extension) extensions.add(extension)
    maxCandidateLength = Math.max(maxCandidateLength, path.length, name.length)
  }

  const uniqueByName = new Map<string, TFile>()
  const ambiguousNames = new Set<string>()
  for (const [name, matchingFiles] of filesByName) {
    if (matchingFiles.length === 1) {
      uniqueByName.set(name, matchingFiles[0])
    } else {
      ambiguousNames.add(name)
    }
  }

  return {
    byPath,
    uniqueByName,
    ambiguousNames,
    extensions,
    maxCandidateLength,
  }
}

/** Resolves one already-extracted candidate without reading the vault. */
export function resolveVaultFileMention(
  candidate: string,
  index: VaultFileMentionIndex,
): TFile | null {
  const trimmed = candidate.trim()
  if (!trimmed || isExcludedCandidate(trimmed)) return null

  const normalized = normalizeVaultPath(trimmed)
  const exactPath = index.byPath.get(normalized)
  if (exactPath) return exactPath

  if (normalized.includes('/') || !hasExtension(normalized)) return null
  if (index.ambiguousNames.has(normalized)) return null
  return index.uniqueByName.get(normalized) ?? null
}

/**
 * Finds file mentions in one text node. The bounded start-position search is
 * needed because a sentence can precede a valid filename containing spaces.
 */
export function scanTextForVaultFileMentions(
  text: string,
  index: VaultFileMentionIndex,
): VaultFileMention[] {
  if (!text || index.extensions.size === 0) return []

  const mentions: VaultFileMention[] = []
  const occupiedUntil = { value: 0 }

  for (const match of text.matchAll(FILE_EXTENSION_RE)) {
    const extension = match[1].toLowerCase()
    if (!index.extensions.has(extension) || match.index == null) continue

    const extensionEnd = match.index + match[0].length
    if (extensionEnd <= occupiedUntil.value) continue

    const lowerBound = Math.max(
      0,
      extensionEnd - Math.max(1, index.maxCandidateLength),
    )
    const starts = candidateStarts(text, lowerBound, extensionEnd)

    let resolved: TFile | null = null
    let resolvedStart = -1
    for (const start of starts) {
      const candidate = text.slice(start, extensionEnd)
      const file = resolveVaultFileMention(candidate, index)
      if (file) {
        resolved = file
        resolvedStart = start
        break
      }
    }

    if (!resolved || resolvedStart < 0) continue

    const end = extensionEnd
    if (resolvedStart < occupiedUntil.value) continue

    mentions.push({
      displayText: text.slice(resolvedStart, end),
      path: normalizeVaultPath(resolved.path),
      start: resolvedStart,
      end,
    })
    occupiedUntil.value = end
  }

  return mentions
}

/** Converts only eligible rendered text nodes into Obsidian internal links. */
export function linkifyVaultFileMentions(
  containerEl: HTMLElement,
  index: VaultFileMentionIndex,
  resolveWikiLink?: (linkpath: string) => TFile | null,
): void {
  const walker = containerEl.ownerDocument.createTreeWalker(
    containerEl,
    SHOW_TEXT,
  )
  const textNodes: Text[] = []
  let current: Node | null = walker.nextNode()
  while (current) {
    if (current.nodeType === TEXT_NODE) {
      textNodes.push(current as Text)
    }
    current = walker.nextNode()
  }

  for (const textNode of textNodes) {
    if (isProtectedTextNode(textNode)) continue

    const wikiMentions: VaultFileMention[] = []
    if (textNode.parentElement?.closest('code') && resolveWikiLink) {
      for (const match of textNode.data.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const target = match[1].split('|', 1)[0]
        const linkpath = target.split('#', 1)[0]
        const file = linkpath && resolveWikiLink(linkpath)
        if (file && match.index != null) {
          wikiMentions.push({
            displayText: match[0],
            path: `${file.path}${target.slice(linkpath.length)}`,
            start: match.index,
            end: match.index + match[0].length,
          })
        }
      }
    }
    const mentions = [
      ...wikiMentions,
      ...scanTextForVaultFileMentions(textNode.data, index).filter(
        (mention) =>
          !wikiMentions.some(
            (wiki) => mention.start < wiki.end && mention.end > wiki.start,
          ),
      ),
    ].sort((a, b) => a.start - b.start)
    if (mentions.length === 0 || !textNode.parentNode) continue

    const fragment = textNode.ownerDocument.createDocumentFragment()
    let cursor = 0
    for (const mention of mentions) {
      if (mention.start < cursor) continue
      if (mention.start > cursor) {
        fragment.append(textNode.data.slice(cursor, mention.start))
      }

      const link = textNode.ownerDocument.createElement('a')
      link.className = 'internal-link verbex-file-mention'
      link.setAttribute('href', mention.path)
      link.textContent = mention.displayText
      fragment.append(link)
      cursor = mention.end
    }

    if (cursor < textNode.data.length) {
      fragment.append(textNode.data.slice(cursor))
    }
    textNode.parentNode.replaceChild(fragment, textNode)
  }
}

function candidateStarts(
  text: string,
  lowerBound: number,
  end: number,
): number[] {
  const starts: number[] = []
  for (let start = lowerBound; start < end; start += 1) {
    if (start === 0 || isCandidateBoundary(text[start - 1])) {
      starts.push(start)
    }
  }
  return starts
}

function isCandidateBoundary(char: string): boolean {
  return CANDIDATE_BOUNDARY_RE.test(char)
}

function isProtectedTextNode(textNode: Text): boolean {
  const parent = textNode.parentElement
  // Inline code spans (single backtick) are intentionally left linkifiable:
  // the assistant commonly wraps filenames and `[[wikilinks]]` in backticks
  // for emphasis, and those mentions should still open on click. Fenced
  // code blocks (`pre > code`) remain protected since `pre` still matches.
  return Boolean(parent?.closest('a, pre, script, style'))
}

function normalizeVaultPath(path: string): string {
  return normalizePath(path.trim()).replace(/^\/+/, '')
}

function isExcludedCandidate(candidate: string): boolean {
  return (
    EXCLUDED_SCHEME_RE.test(candidate) ||
    /^[A-Za-z]:[\\/]/.test(candidate) ||
    candidate.startsWith('//')
  )
}

function hasExtension(path: string): boolean {
  const name = path.split('/').pop() ?? path
  return name.lastIndexOf('.') > 0
}
