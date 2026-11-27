import type { JsonValue } from '../protocol'

/** True when the string has a CR, a NUL, or an unpaired surrogate. */
export function hasInvalidText(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code === 0x0d || code === 0) return true
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

/** True when the text starts with a byte order mark. */
export function startsWithBom(text: string): boolean {
  return text.charCodeAt(0) === 0xfeff
}

/** True when any string value or object key inside the JSON value is invalid. */
export function jsonHasInvalidText(value: JsonValue): boolean {
  if (typeof value === 'string') return hasInvalidText(value)
  if (Array.isArray(value)) return value.some(jsonHasInvalidText)
  if (value && typeof value === 'object')
    return Object.entries(value).some(
      ([key, item]) => hasInvalidText(key) || jsonHasInvalidText(item),
    )
  return false
}
