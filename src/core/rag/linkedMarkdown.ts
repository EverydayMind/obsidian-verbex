import { App, TFile, normalizePath } from 'obsidian'

const MARKDOWN_LINK_TARGET_REGEX = /!?\[[^\]]*]\(([^)]+)\)/g
const WIKILINK_TARGET_REGEX = /!?\[\[([^\]]+)]]/g

export type MarkdownLinkReference = {
  /** File target without the `#anchor` or wikilink alias. */
  target: string
  /** Optional heading anchor, without the leading `#`. */
  anchor?: string
}

/**
 * Extract local markdown references while retaining heading anchors.
 *
 * The older `extractMarkdownLinkTargets` API intentionally returns only file
 * paths because several callers use it for graph discovery. RAG hydration
 * needs the anchor as well, so this structured companion API keeps that
 * information without changing the legacy callers' contract.
 */
export function extractMarkdownLinkReferences(
  content: string,
): MarkdownLinkReference[] {
  const references: MarkdownLinkReference[] = []

  for (const match of content.matchAll(WIKILINK_TARGET_REGEX)) {
    const reference = parseLinkReference(match[1].split('|')[0])
    if (reference.target || reference.anchor) {
      references.push(reference)
    }
  }

  for (const match of content.matchAll(MARKDOWN_LINK_TARGET_REGEX)) {
    const reference = parseLinkReference(stripMarkdownLinkTitle(match[1]))
    if (reference.target && isLocalMarkdownLinkTarget(reference.target)) {
      references.push(reference)
    }
  }

  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.target}#${reference.anchor ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractMarkdownLinkTargets(content: string): string[] {
  return [
    ...new Set(
      extractMarkdownLinkReferences(content)
        .map((reference) => reference.target)
        .filter((target) => target.length > 0),
    ),
  ]
}

export function resolveLinkedMarkdownFile({
  app,
  sourcePath,
  linkTarget,
}: {
  app: App
  sourcePath: string
  linkTarget: string
}): TFile | null {
  const normalizedTarget = stripSubpath(decodeUriComponentSafe(linkTarget))
  if (!normalizedTarget) {
    return null
  }

  const metadataCacheMatch = app.metadataCache.getFirstLinkpathDest(
    normalizedTarget,
    sourcePath,
  )
  if (isMarkdownFile(metadataCacheMatch)) {
    return metadataCacheMatch
  }

  const candidates = getPathCandidates(normalizedTarget, sourcePath)
  for (const candidate of candidates) {
    const file = app.vault.getFileByPath(candidate)
    if (isMarkdownFile(file)) {
      return file
    }
  }

  return null
}

function stripMarkdownLinkTitle(target: string): string {
  const trimmed = target.trim()
  const withoutAngleBrackets =
    trimmed.startsWith('<') && trimmed.endsWith('>')
      ? trimmed.slice(1, -1)
      : trimmed
  return withoutAngleBrackets
    .replace(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/, '')
    .trim()
}

function stripSubpath(target: string): string {
  return target.split('#')[0].split('?')[0].trim()
}

function parseLinkReference(target: string): MarkdownLinkReference {
  const trimmed = target.trim()
  const hashIndex = trimmed.indexOf('#')
  const rawTarget = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
  const rawAnchor = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : ''
  const normalizedTarget = stripSubpath(rawTarget)
  const normalizedAnchor = decodeUriComponentSafe(rawAnchor)
    .trim()
    .replace(/^#+/, '')
  return {
    target: normalizedTarget,
    ...(normalizedAnchor ? { anchor: normalizedAnchor } : {}),
  }
}

function isLocalMarkdownLinkTarget(target: string): boolean {
  if (!target || target.startsWith('#')) {
    return false
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return false
  }
  return true
}

function getPathCandidates(target: string, sourcePath: string): string[] {
  const withoutLeadingSlash = target.startsWith('/') ? target.slice(1) : target
  const sourceFolder = sourcePath.includes('/')
    ? sourcePath.slice(0, sourcePath.lastIndexOf('/'))
    : ''
  const basePaths = target.startsWith('/')
    ? [withoutLeadingSlash]
    : [
        withoutLeadingSlash,
        sourceFolder
          ? normalizePath(`${sourceFolder}/${withoutLeadingSlash}`)
          : withoutLeadingSlash,
      ]

  return [
    ...new Set(basePaths.flatMap((path) => [path, ensureMdExtension(path)])),
  ]
}

function ensureMdExtension(path: string): string {
  return path.toLowerCase().endsWith('.md') ? path : `${path}.md`
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isMarkdownFile(file: TFile | null): file is TFile {
  return file instanceof TFile && file.extension === 'md'
}
