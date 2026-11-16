/** Preserve JavaScript String coercion, including object hooks and exceptions. */
export function stringifyUnknown(value: unknown): string {
  return String(value)
}
