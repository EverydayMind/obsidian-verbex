/** Metadata keywords: English words have boundaries; CJK keeps particle matching. */
export function matchesRequestKeyword(
  text: string,
  rawKeyword: string,
): boolean {
  const keyword = rawKeyword.trim().toLowerCase()
  if (!keyword) return false
  if (!/^[a-z][a-z0-9 _-]*[a-z0-9]$|^[a-z]$/i.test(keyword))
    return text.toLowerCase().includes(keyword)
  const escaped = keyword
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[ -]+/g, '[ -]+')
  const plural = /[^aeiou]y$/.test(escaped)
    ? `${escaped.slice(0, -1)}ies`
    : `${escaped}(?:s|es)?`
  return new RegExp(`\\b(?:${escaped}|${plural})\\b`, 'i').test(text)
}
