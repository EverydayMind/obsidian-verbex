export function parseToolArgs(value?: string): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
/** False only for argument text that is present but not a JSON object. An
 * empty string is how a streamed call with no arguments ends; it is valid. */
export function toolArgsValid(value?: string): boolean {
  if (!value?.trim()) return true
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    return (
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    )
  } catch {
    return false
  }
}
