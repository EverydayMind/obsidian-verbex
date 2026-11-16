/** The active file and file mentions of this turn, for resource-type routing. */
export function turnResourcePaths(input: {
  currentFile?: { path: string } | null
  mentionables?: readonly unknown[]
}): string[] {
  const paths = input.currentFile ? [input.currentFile.path] : []
  for (const item of input.mentionables ?? []) {
    const file = (item as { file?: { path?: unknown } } | null)?.file
    if (typeof file?.path === 'string') paths.push(file.path)
  }
  return paths
}
