import { normalizePath } from 'obsidian'

export function preparedSampleMatches(
  path: string,
  preparation?: {
    trigger?: string
    samplePath: string
    result: Record<string, unknown>
  },
): boolean {
  if (
    preparation?.trigger !== 'explicit' ||
    preparation.result.state !== 'ready'
  )
    return false
  if (!path || !preparation.samplePath) return false
  const normalized = normalizePath(path)
  return !!normalized && normalized === normalizePath(preparation.samplePath)
}
