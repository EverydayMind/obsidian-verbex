import { normalizePath } from 'obsidian'

import type { CompositeChange } from '../../verbex/types'

/** Composer arguments must refer to the same files that were checkpointed. */
export function assertComposerTargets(composite: CompositeChange): void {
  const p = composite.params
  const path = (key: string): string => {
    const value = p[key]
    if (typeof value !== 'string' || !value)
      throw new Error('Invalid composite target.')
    return normalizePath(value)
  }
  const entry = (op: string, target: string, original?: string) =>
    composite.entries.some(
      (item) =>
        item.op === op &&
        normalizePath(item.path) === target &&
        (original === undefined ||
          (typeof item.originalPath === 'string' &&
            normalizePath(item.originalPath) === original)),
    )
  if (composite.operation === 'note_merge') {
    const source = path('sourcePath'),
      target = path('targetPath')
    if (
      source === target ||
      !entry('delete', source) ||
      !entry('modify', target)
    )
      throw new Error('Composite targets do not match the write set.')
  } else if (composite.operation === 'note_extract') {
    const source = path('sourcePath'),
      target = path('newPath')
    if (
      source === target ||
      !entry('modify', source) ||
      !entry('create', target)
    )
      throw new Error('Composite targets do not match the write set.')
  } else if (composite.operation === 'file_trash') {
    if (!entry('delete', path('path')))
      throw new Error('Composite targets do not match the write set.')
  } else if (composite.operation === 'note_rename') {
    const source = path('path'),
      target = path('newPath')
    if (source === target || !entry('rename', target, source))
      throw new Error('Composite targets do not match the write set.')
  }
}
