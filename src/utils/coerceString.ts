/** Preserve JavaScript String coercion, including arrays and custom object hooks. */
export function coerceString(value: unknown): string {
  return String(value)
}
