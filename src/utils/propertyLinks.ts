import type { App } from 'obsidian'

import { stringifyUnknown } from './stringifyUnknown'

export function normalizePropertyLink(
  value: unknown,
  app?: App,
  sourcePath = '',
): string {
  const raw = stringifyUnknown(value ?? '').trim()
  const text = (
    raw.match(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/)?.[1] ?? raw
  ).trim()
  const resolved = app?.metadataCache.getFirstLinkpathDest?.(text, sourcePath)
  return (resolved?.path ?? text)
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .toLowerCase()
}

export function propertyValueMatches(
  value: unknown,
  expected: unknown,
  app?: App,
  sourcePath = '',
): boolean {
  if (Array.isArray(value))
    return value.some((item) =>
      propertyValueMatches(item, expected, app, sourcePath),
    )
  if (value && typeof value === 'object')
    return Object.values(value).some((item) =>
      propertyValueMatches(item, expected, app, sourcePath),
    )
  return (
    normalizePropertyLink(value, app, sourcePath) ===
    normalizePropertyLink(expected, app, sourcePath)
  )
}
