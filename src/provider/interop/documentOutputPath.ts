import type { App } from 'obsidian'

export type PathProblem =
  | 'listing_failed'
  | 'stat_failed'
  | 'not_directory'
  | 'ambiguous_path'
export type PathProbe =
  | { kind: 'free' | 'occupied' }
  | { kind: 'unreadable'; reason: PathProblem }

export const outputPathKey = (path: string): string =>
  path.normalize('NFC').toLowerCase()

/** Walk each actual parent: adapter.exists() alone is not portable across case/Unicode rules. */
export async function probeOutputPath(
  app: App,
  path: string,
): Promise<PathProbe> {
  const parts = path.split('/')
  let parent = ''
  for (const [index, part] of parts.entries()) {
    let listing: { files: string[]; folders: string[] }
    try {
      listing = await app.vault.adapter.list(parent)
    } catch {
      return { kind: 'unreadable', reason: 'listing_failed' }
    }
    const matches = [...listing.files, ...listing.folders].filter(
      (item) =>
        outputPathKey(item.split('/').filter(Boolean).pop() ?? '') ===
        outputPathKey(part),
    )
    if (matches.length > 1)
      return { kind: 'unreadable', reason: 'ambiguous_path' }
    const match = matches[0]
    if (!match) return { kind: 'free' }
    let stat
    try {
      stat = await app.vault.adapter.stat(match)
    } catch {
      return { kind: 'unreadable', reason: 'stat_failed' }
    }
    if (!stat || (stat.type !== 'file' && stat.type !== 'folder'))
      return { kind: 'unreadable', reason: 'stat_failed' }
    if (index === parts.length - 1) return { kind: 'occupied' }
    if (stat.type !== 'folder')
      return { kind: 'unreadable', reason: 'not_directory' }
    parent = match
  }
  return { kind: 'free' }
}
