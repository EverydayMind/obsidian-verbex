import type { App } from 'obsidian'

import { assertUserVaultPath } from '../../security/vaultPathPolicy'

import { outputPathKey } from './documentOutputPath'

/** Undefined means identity cannot be established safely. */
export async function sameVaultFile(
  app: App,
  a: string,
  b: string,
): Promise<boolean | undefined> {
  try {
    a = assertUserVaultPath(app, a)
    b = assertUserVaultPath(app, b)
    if (a === b) return true
    if (outputPathKey(a) !== outputPathKey(b)) return false
    let parent = ''
    for (const part of a.split('/')) {
      const listing = await app.vault.adapter.list(parent)
      const matches = [...listing.files, ...listing.folders].filter(
        (p) => outputPathKey(p.split('/').pop() ?? '') === outputPathKey(part),
      )
      if (matches.length !== 1) return undefined
      parent = matches[0]
    }
    const stat = await app.vault.adapter.stat(parent)
    return stat?.type === 'file' ? true : undefined
  } catch {
    return undefined
  }
}
