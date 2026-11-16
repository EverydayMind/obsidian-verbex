import type { App, EventRef } from 'obsidian'

export function observeTidyChanges(vault: App['vault'], touched: Set<string>) {
  const refs: EventRef[] = []
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
    for (const name of ['create', 'modify', 'delete', 'rename'] as const)
      refs.push(
        vault.on(
          name as 'modify',
          (file: { path: string }, oldPath?: string) => {
            touched.add(file.path)
            if (typeof oldPath === 'string') touched.add(oldPath)
          },
        ),
      )
  } catch (error) {
    try {
      release()
    } catch {
      // Preserve the original registration error after attempting all cleanup.
    }
    throw error
  }
  return release
}
