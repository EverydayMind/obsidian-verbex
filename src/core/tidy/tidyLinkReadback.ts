import { type App, normalizePath } from 'obsidian'

import type { CompositeChange } from '../../verbex/types'
import { extractLinks } from '../tools/localToolCommon'

export type CapturedLinks = Map<string, { before: string; count: number }>

function countLinks(app: App, content: string, source: string, target: string) {
  return extractLinks(content, false).filter((link) => {
    const linkpath = link.split(/[#^]/)[0]
    return (
      app.metadataCache.getFirstLinkpathDest(linkpath, source)?.path === target
    )
  }).length
}

export async function captureLinks(
  app: App,
  composite: CompositeChange,
): Promise<CapturedLinks> {
  const result: CapturedLinks = new Map()
  if (!['note_merge', 'note_rename'].includes(composite.operation))
    return result
  const target = String(composite.params.sourcePath ?? composite.params.path)
  for (const entry of composite.entries) {
    if (entry.op !== 'modify') continue
    const before = await app.vault.adapter.read(normalizePath(entry.path))
    const count = countLinks(app, before, entry.path, target)
    if (count) result.set(entry.path, { before, count })
  }
  return result
}

export async function readLinks(
  app: App,
  composite: CompositeChange,
  originalLinks: CapturedLinks,
) {
  const target = String(composite.params.targetPath ?? composite.params.newPath)
  let updated = 0,
    unchanged = 0
  const brokenPaths: string[] = []
  for (const [path, { before, count }] of originalLinks) {
    const current = app.vault.getAbstractFileByPath(normalizePath(path))
      ? await app.vault.adapter.read(normalizePath(path))
      : null
    if (current === null || countLinks(app, current, path, target) < count)
      brokenPaths.push(path)
    else if (current.replace(/\r\n/g, '\n') !== before.replace(/\r\n/g, '\n'))
      updated += 1
    else unchanged += 1
  }
  return {
    updated,
    unchanged,
    broken: brokenPaths.length,
    total: originalLinks.size,
    brokenPaths,
  }
}
