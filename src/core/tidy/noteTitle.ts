import * as modelText from './noteTitleText'

/**
 * Deterministic note-title normalization for Windows file names and Obsidian
 * links. Titles are never left to the model. Not `safeWikiName`: that function
 * is bound byte-for-byte to treaty term file names.
 */

export const MAX_TITLE_LENGTH = 100
/** Windows MAX_PATH minus the terminating NUL. */
export const MAX_FULL_PATH_LENGTH = 259

const RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[0-9¹²³]|LPT[0-9¹²³])(?:\..*)?$/i

const replacements = (): [RegExp, string, string][] => [
  [/:/g, ' - ', modelText.colon()],
  [/[/\\]/g, '·', modelText.slashes()],
  [/\|/g, '·', modelText.pipe()],
  [/"/g, "'", modelText.quote()],
  [/</g, '(', modelText.lessThan()],
  [/>/g, ')', modelText.greaterThan()],
  [/[?*]/g, '', modelText.wildcards()],
  // eslint-disable-next-line no-control-regex -- Remove control characters from note titles
  [/[\u0000-\u001f\u007f]/g, '', modelText.controls()],
  [/[#^]/g, '', modelText.anchors()],
  [/\[/g, '(', modelText.openBracket()],
  [/\]/g, ')', modelText.closeBracket()],
]

export type NoteTitleResult =
  | {
      ok: true
      title: string
      changed: boolean
      reasons: string[]
      /** The original wording, worth keeping in `aliases` when changed. */
      displayTitle: string
    }
  | { ok: false; reason: string }

export function sanitizeNoteTitle(
  raw: string,
  options: { vaultBasePath?: string; folder?: string } = {},
): NoteTitleResult {
  const displayTitle = raw.trim()
  const reasons: string[] = []
  let title = displayTitle.normalize('NFC')
  if (title !== displayTitle) reasons.push(modelText.nfc())
  if (/\.md$/i.test(title)) {
    title = title.replace(/\.md$/i, '')
    reasons.push(modelText.extension())
  }
  for (const [pattern, replacement, reason] of replacements()) {
    const next = title.replace(pattern, replacement)
    if (next !== title) reasons.push(reason)
    title = next
  }
  const collapsed = title.replace(/\s+/g, ' ').trim()
  if (collapsed !== title.trim()) reasons.push(modelText.spaces())
  title = collapsed
  const trimmedEnd = title.replace(/[.\s]+$/, '')
  if (trimmedEnd !== title) reasons.push(modelText.trimEnd())
  title = trimmedEnd
  const trimmedStart = title.replace(/^[.\s]+/, '')
  if (trimmedStart !== title) reasons.push(modelText.trimStart())
  title = trimmedStart
  if (RESERVED_NAME.test(title)) {
    title = modelText.reservedTitle(title)
    reasons.push(modelText.reservedName())
  }
  const budget = Math.min(
    MAX_TITLE_LENGTH,
    MAX_FULL_PATH_LENGTH - fixedPathLength(options),
  )
  if (budget < 1) return { ok: false, reason: modelText.longFolder() }
  if (title.length > budget) {
    title = shorten(title, budget)
    reasons.push(modelText.lengthLimit(budget))
  }
  if (!title) return { ok: false, reason: modelText.emptyTitle() }
  return {
    ok: true,
    title,
    changed: title !== displayTitle,
    reasons,
    displayTitle,
  }
}

function fixedPathLength(options: {
  vaultBasePath?: string
  folder?: string
}): number {
  const base = options.vaultBasePath
    ? options.vaultBasePath.replace(/[\\/]+$/, '').length + 1
    : 0
  const folder = options.folder
    ? options.folder.replace(/\/+$/, '').length + 1
    : 0
  return base + folder + '.md'.length
}

function shorten(title: string, budget: number): string {
  const cut = title.slice(0, budget)
  const boundary = cut.lastIndexOf(' ')
  const shortened = boundary > budget / 2 ? cut.slice(0, boundary) : cut
  return shortened.replace(/[.\s·-]+$/, '')
}

/** Windows file systems compare names case-insensitively. */
export function sameFileName(a: string, b: string): boolean {
  return a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase()
}
