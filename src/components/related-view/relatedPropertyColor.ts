export const RELATED_GRAPH_PROPERTY_COLORS = 7

/**
 * Colour slot for a property name. It depends on the name only, so one
 * property keeps its colour from note to note.
 */
export function propertyColorIndex(name: string): number {
  let hash = 0
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  }
  return hash % RELATED_GRAPH_PROPERTY_COLORS
}
