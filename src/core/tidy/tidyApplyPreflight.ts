import { type App, normalizePath } from 'obsidian'

import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import type { CompositeChange } from '../../verbex/types'

/** Recheck every approved source before starting a multi-file operation. */
export async function assertCompositeCurrent(
  app: App,
  composite: CompositeChange,
): Promise<void> {
  for (const entry of composite.entries) {
    const path = assertUserVaultPath(app, entry.originalPath ?? entry.path)
    const exists = await app.vault.adapter.exists(path)
    const current = exists ? await app.vault.adapter.read(path) : null
    const normalize = (value: string | null) =>
      value?.replace(/\r\n/g, '\n') ?? null
    if (normalize(current) !== normalize(entry.before))
      throw new Error(`Conflict: "${path}" changed during apply.`)
    if (entry.op === 'rename' && entry.originalPath) {
      const destination = assertUserVaultPath(app, entry.path)
      if (
        normalizePath(destination) !== normalizePath(path) &&
        (await app.vault.adapter.exists(destination))
      )
        throw new Error(`Conflict: "${destination}" already exists.`)
    }
  }
}
