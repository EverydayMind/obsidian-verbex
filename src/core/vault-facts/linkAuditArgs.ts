import type { ToolArgs } from '../tools/localToolCommon'

import * as modelText from './linkAuditText'

export function validateLinkAuditArgs(args: ToolArgs): string | undefined {
  const unknown = Object.keys(args).find(
    (key) => !['kind', 'folder', 'limit', 'offset'].includes(key),
  )
  if (unknown) return modelText.unknownArgument(unknown)
  if (
    args.kind !== undefined &&
    (typeof args.kind !== 'string' ||
      !['unresolved', 'orphans'].includes(args.kind))
  )
    return modelText.kindError()
  if (args.folder !== undefined && typeof args.folder !== 'string')
    return modelText.folderError()
  for (const [key, min, max] of [
    ['limit', 1, 500],
    ['offset', 0, Number.MAX_SAFE_INTEGER],
  ] as const) {
    const value = args[key]
    if (
      value !== undefined &&
      (typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < min ||
        value > max)
    )
      return modelText.integerError(key, min, max)
  }
}
