/** Whether an extension has an Obsidian view suitable for automatic opening. */
export function hasRegisteredView(
  registry: unknown,
  extension: string,
): boolean {
  const ext = extension.toLowerCase()
  const lookup = (registry as { getTypeByExtension?: unknown } | null)
    ?.getTypeByExtension
  if (typeof lookup === 'function') {
    try {
      const type: unknown = lookup.call(registry, ext)
      return typeof type === 'string' && type.length > 0 && type !== 'unknown'
    } catch {
      // Older or incompatible registries use the conservative fallback below.
    }
  }
  return ext === 'md' || ext === 'canvas' || ext === 'base'
}
