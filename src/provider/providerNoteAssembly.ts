/**
 * Joins the per-turn provider notes in the given order, dropping empty
 * parts. This is the single place where a notes budget can be applied.
 */
export function assembleProviderNotes(
  parts: readonly (string | undefined | null | false)[],
): string {
  return parts.filter(Boolean).join('\n\n')
}
