export type RetrievalScope = {
  files: string[]
  folders: string[]
}

export function isPathWithinScope(
  path: string,
  scope?: RetrievalScope,
): boolean {
  if (!scope || (scope.files.length === 0 && scope.folders.length === 0)) {
    return true
  }
  if (scope.files.includes(path)) return true
  return scope.folders.some((folder) => path.startsWith(`${folder}/`))
}
