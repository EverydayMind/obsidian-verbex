/** Quoted spans in user text, shared by document reference and scope routing. */
export const QUOTED_SPAN_RE =
  /`([^`\n]{2,200})`|‘([^’\n]{2,200})’|“([^”\n]{2,200})”|「([^」\n]{2,200})」|『([^』\n]{2,200})』|"([^"\n]{2,200})"|(?<![\p{L}\p{N}])'([^'\n]{2,200})'(?![\p{L}\p{N}])/gu

/**
 * A quoted span that reads as one file name or path: no sentence punctuation,
 * a plausible extension at the end, and no more words than a title would have.
 * Quoted prose that happens to end in ".md" or a version number is not a name.
 */
function looksLikeFileName(value: string): boolean {
  const name = value.trim()
  if (!/\.[a-z0-9]{1,10}$/i.test(name)) return false
  if (/[.!?。！？,;:]\s/.test(name)) return false
  const stem = name.replace(/\.[a-z0-9]{1,10}$/i, '')
  if (!stem || stem.split(/\s+/).length > 12) return false
  // "…검토해줘 v1.0": a request sentence followed by a version token. The
  // word carrying the extension is then a short bare version, not a name.
  const last = stem.split(/\s+/).at(-1) ?? ''
  if (/^v?\d+$/i.test(last) && stem.includes(' ')) return false
  // Prose inside quotes: a word ending in a Korean particle or verb
  // connective that is followed by another word. File names and titles do
  // not carry a free "…을 "/"…해 " joint between their words.
  return !/(?:을|를|은|는|이|가|의|에|로|와|과|해|할|된|한|하고|하여|해서)\s+\S/.test(
    stem,
  )
}

/** Omit only quoted filenames, not quoted prose or the user's actual actions. */
export function withoutQuotedFileNames(text: string): string {
  return text.replace(QUOTED_SPAN_RE, (span: string, ...groups: unknown[]) => {
    const value = groups.slice(0, 7).find((group) => typeof group === 'string')
    return typeof value === 'string' && looksLikeFileName(value) ? ' ' : span
  })
}
