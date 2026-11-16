import { normalizePath } from 'obsidian'

import type { ToolMetadata } from '../core/tools/toolMetadata'

export function toolArgPaths(
  argsJson: string,
  metadata?: Pick<ToolMetadata, 'pathArgs'>,
): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(argsJson)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const args = parsed as Record<string, unknown>
  const result = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim())
      result.add(normalizePath(value))
  }
  add(args.path)
  if (Array.isArray(args.paths)) args.paths.forEach(add)
  for (const key of metadata?.pathArgs ?? []) {
    const value = args[key]
    if (Array.isArray(value)) value.forEach(add)
    else add(value)
  }
  return [...result]
}
