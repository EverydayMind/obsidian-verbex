import type { App } from 'obsidian'

/** Bounded, in-memory path matching; event paths are not persisted or attributed. */
export function trackVaultChanges(vaultPath: (path: string) => string) {
  const paths = new Set<string>()
  let unknown = false
  const remember = (path: string | undefined) => {
    if (!path) {
      unknown = true
      return
    }
    try {
      const canonical = vaultPath(path).normalize('NFC').toLowerCase()
      if (!canonical || (paths.size >= 256 && !paths.has(canonical)))
        unknown = true
      else paths.add(canonical)
    } catch {
      unknown = true
    }
  }
  return {
    hasChanges: () => unknown || paths.size > 0,
    onEvent: (event: string, path: string, oldPath?: string) => {
      remember(path)
      if (event === 'rename') remember(oldPath)
    },
    affects: (path: string) => {
      const target = path.normalize('NFC').toLowerCase()
      return (
        unknown ||
        [...paths].some(
          (changed) => target === changed || target.startsWith(`${changed}/`),
        )
      )
    },
  }
}

/** Install all observers or release the ones installed before a failure. */
export function observeVaultEvents(
  vault: App['vault'],
  onEvent: (event: string, path: string, oldPath?: string) => void,
): () => void {
  const refs: ReturnType<typeof vault.on>[] = []
  const release = () => {
    let firstError: unknown
    let failed = false
    for (const ref of refs) {
      try {
        vault.offref(ref)
      } catch (error) {
        if (!failed) firstError = error
        failed = true
      }
    }
    if (failed) throw firstError
  }
  try {
    for (const event of ['create', 'modify', 'delete', 'rename'] as const)
      refs.push(
        vault.on(event as 'rename', (file, oldPath) =>
          onEvent(event, file.path, oldPath),
        ),
      )
  } catch (error) {
    try {
      release()
    } catch {
      /* preserve the registration failure */
    }
    throw error
  }
  return release
}
