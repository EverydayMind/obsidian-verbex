import { sha256Hex } from '../../utils/hash'
import { frontmatterValue } from '../tools/reviewIndexMetadata'

import { isSafeTreatySourcePath } from './treatySourceRange'

type SourceMode = 'file' | 'folder'
type Source = { path: string; lines: string[] }
type SourceVault = {
  read(path: string): Promise<string>
  getMarkdownFiles(): { path: string }[]
}

function supportsSnapshot(
  scope: string,
  mode: SourceMode,
  wikiFolder: string,
): boolean {
  if (!isSafeTreatySourcePath(scope) || !isSafeTreatySourcePath(wikiFolder))
    return false
  // Generated index files inside the source scope would change the source set themselves.
  return mode === 'file'
    ? scope !== wikiFolder && !scope.startsWith(`${wikiFolder}/`)
    : wikiFolder !== scope &&
        !wikiFolder.startsWith(`${scope}/`) &&
        !scope.startsWith(`${wikiFolder}/`)
}

export async function treatySourceSnapshot(
  sources: Source[],
  scope: string,
  mode: SourceMode,
  wikiFolder: string,
): Promise<string | null> {
  if (
    !supportsSnapshot(scope, mode, wikiFolder) ||
    sources.length === 0 ||
    sources.some(
      ({ path }) =>
        !isSafeTreatySourcePath(path) ||
        (mode === 'file' ? path !== scope : !path.startsWith(`${scope}/`)),
    )
  )
    return null
  const entries = sources.map(({ path, lines }) => [path, lines.join('\n')])
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return sha256Hex(JSON.stringify(entries))
}

export async function treatySourceSnapshotFields(
  sources: Source[],
  sourcePath: string,
  sourceFolder: string,
  wikiFolder: string,
): Promise<string[]> {
  const mode = sourcePath ? 'file' : 'folder'
  const snapshot = await treatySourceSnapshot(
    sources,
    sourceFolder || sourcePath,
    mode,
    wikiFolder,
  )
  return snapshot
    ? [`source_mode: "${mode}"`, `source_snapshot_sha256: "${snapshot}"`]
    : []
}

export async function checkTreatySourceSnapshot(
  vault: SourceVault,
  checklist: string,
  wikiFolder: string,
): Promise<'matched' | 'changed' | 'unavailable'> {
  const expected = frontmatterValue(checklist, 'source_snapshot_sha256') ?? ''
  const scope = frontmatterValue(checklist, 'source') ?? ''
  const mode = frontmatterValue(checklist, 'source_mode')
  if (
    !/^[0-9a-f]{64}$/i.test(expected) ||
    (mode !== 'file' && mode !== 'folder') ||
    !supportsSnapshot(scope, mode, wikiFolder)
  )
    return 'unavailable'
  const paths = vault
    .getMarkdownFiles()
    .map((file) => file.path)
    .filter((path) =>
      mode === 'file' ? path === scope : path.startsWith(`${scope}/`),
    )
  if (paths.some((path) => !isSafeTreatySourcePath(path))) return 'unavailable'
  if (paths.length === 0) return 'changed'
  try {
    const sources = await Promise.all(
      paths.map(async (path) => ({
        path,
        lines: (await vault.read(path)).split(/\r?\n/),
      })),
    )
    const actual = await treatySourceSnapshot(sources, scope, mode, wikiFolder)
    return actual === expected.toLowerCase()
      ? 'matched'
      : actual
        ? 'changed'
        : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
