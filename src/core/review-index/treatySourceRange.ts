import { frontmatterValue } from '../tools/reviewIndexMetadata'

type SourceVault = {
  read(path: string): Promise<string>
  getMarkdownFiles(): { path: string }[]
}

export function isSafeTreatySourcePath(path: string): boolean {
  return (
    !!path &&
    !/^[\\/]|^[A-Za-z]:/.test(path) &&
    !path.includes('\\') &&
    ![...path].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    path.split('/').every((part) => !!part && !part.startsWith('.'))
  )
}

/** Compare only a listed Markdown source inside the checklist's declared source scope. */
export function createTreatySourceRangeChecker(
  vault: SourceVault,
  checklist: string,
): (
  unit: string,
  body: string,
) => Promise<'matched' | 'changed' | 'unavailable'> {
  const scope = frontmatterValue(checklist, 'source') ?? ''
  const files = new Set(vault.getMarkdownFiles().map((file) => file.path))
  const cache = new Map<string, Promise<string[] | null>>()
  return async (unit, body) => {
    const source = frontmatterValue(unit, 'source') ?? ''
    const range = /^(\d+)-(\d+)$/.exec(
      frontmatterValue(unit, 'source_lines') ?? '',
    )
    if (
      !isSafeTreatySourcePath(scope) ||
      !isSafeTreatySourcePath(source) ||
      !files.has(source) ||
      (source !== scope && !source.startsWith(`${scope}/`)) ||
      !range
    )
      return 'unavailable'
    const start = Number(range[1]),
      end = Number(range[2])
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start
    )
      return 'unavailable'
    if (!cache.has(source))
      cache.set(
        source,
        vault
          .read(source)
          .then((text) => text.split(/\r?\n/))
          .catch(() => null),
      )
    const lines = await cache.get(source)
    if (!lines || end > lines.length) return 'unavailable'
    return lines.slice(start - 1, end).join('\n') === body
      ? 'matched'
      : 'changed'
  }
}
