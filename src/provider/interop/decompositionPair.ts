import { parse } from 'yaml'

import { DecomposeError, RULES } from '../../core/document-jobs/decompose/types'
import { NOTE_FORMATS, noteFormat } from '../../i18n/noteFormats'
import { sha256HexBytes } from '../../utils/hash'

import { inspectDecompositionRecord } from './decompositionInspection'
import {
  documentJobFileBytes,
  documentJobFileHash,
} from './documentJobFileHash'
import { outputBaseName } from './documentJobOutput'
import { outputPathKey, probeOutputPath } from './documentOutputPath'
import type { HostContext } from './editorActions'
import { hostInternalRead } from './hostInternalRead'

export function decompositionFrontmatter(
  markdown: string,
): Record<string, unknown> {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return {}
  const value: unknown = parse(match[1], { maxAliasCount: 0 })
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
export const siblingPath = (path: string, name: string) =>
  [...path.split('/').slice(0, -1), name].join('/')

/** Exporter owns package parsing and the record-excluded payload digest. */
export async function inspectDecompositionPair(
  host: HostContext,
  path: string,
  signal?: AbortSignal,
) {
  const sha256 = await documentJobFileHash(host, path)
  const decomposition = await inspectDecompositionRecord(
    host,
    path,
    sha256,
    signal,
  )
  const report = !decomposition.record
    ? {}
    : await hostInternalRead(
        host,
        'md-to-hwpx',
        'get_derivation_report',
        { path, expected_sha256: sha256 },
        signal,
      )
  const record = decomposition.record
  const markers = decomposition.markerInventory ?? report.markerInventory
  if (!Array.isArray(markers) || markers.length > 64)
    throw new Error('Invalid template inventory.')
  const templateState: 'as_saved' | 'modified' | 'absent' = !record
    ? 'absent'
    : record.templatePayloadSha256 === decomposition.payloadSha256
      ? 'as_saved'
      : 'modified'
  let markdown = ''
  let textPath = '',
    textState = 'pair_mismatch',
    frontmatter: Record<string, unknown> = {}
  if (record) {
    textPath = host.vaultPath(siblingPath(path, record.textFile))
    try {
      const bytes = await documentJobFileBytes(host, textPath, RULES.textBytes)
      markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      frontmatter = decompositionFrontmatter(markdown)
      if (
        frontmatter['hwpx-decomposition'] === record.decompositionId &&
        (frontmatter['hwpx-dialect'] === undefined ||
          frontmatter['hwpx-dialect'] === record.dialect)
      )
        textState =
          (await sha256HexBytes(bytes)) === record.textSha256
            ? 'as_saved'
            : 'text_modified'
    } catch (error) {
      signal?.throwIfAborted()
    }
  }
  signal?.throwIfAborted()
  if ((await documentJobFileHash(host, path)) !== sha256)
    throw new Error('Template changed during inspection.')
  return {
    ...(decomposition.recordRetired
      ? { recordRetired: decomposition.recordRetired }
      : {}),
    path,
    sha256,
    record,
    templateState,
    textPath,
    textState,
    frontmatter,
    markdown,
    prefixes: Object.fromEntries(
      (decomposition.markerInventory ?? []).map((m) => [m.marker, m.prefix]),
    ),
    markers: markers.flatMap((m) =>
      m &&
      typeof m === 'object' &&
      !Array.isArray(m) &&
      typeof m.marker === 'string'
        ? [m.marker]
        : [],
    ),
  }
}

export async function decompositionPaths(
  host: HostContext,
  samplePath: string,
  name?: string,
) {
  const base = outputBaseName(
    samplePath,
    name ?? (samplePath.split('/').pop() ?? '').replace(/\.[^.]+$/, ''),
  )
  for (let n = 1; n <= 10000; n++) {
    const suffix = n === 1 ? '' : `-${n}`
    const textPath = host.vaultPath(
      siblingPath(samplePath, `${base}${noteFormat('textSuffix')}${suffix}.md`),
    )
    const templatePath = host.vaultPath(
      siblingPath(
        samplePath,
        `${base}${noteFormat('templateSuffix')}${suffix}.hwpx`,
      ),
    )
    if ((templatePath.split('/').pop() ?? '').length > 255)
      throw new Error('Decomposition name too long.')
    const text = await probeOutputPath(host.app, textPath),
      template = await probeOutputPath(host.app, templatePath)
    if (text.kind === 'unreadable' || template.kind === 'unreadable')
      throw new Error('Decomposition path unreadable.')
    if (text.kind === 'free' && template.kind === 'free')
      return { base, textPath, templatePath }
  }
  throw new Error('No decomposition name available.')
}
export async function findDecompositionPair(
  host: HostContext,
  samplePath: string,
  base: string,
  id: string,
  signal?: AbortSignal,
) {
  const folder = samplePath.split('/').slice(0, -1).join('/')
  const files = (await host.app.vault.adapter.list(folder)).files
    .filter((path) => {
      const name = outputPathKey(path.split('/').pop() ?? '')
      return (
        Object.values(NOTE_FORMATS.templateSuffix).some((suffix) =>
          name.startsWith(outputPathKey(`${base}${suffix}`)),
        ) && name.endsWith('.hwpx')
      )
    })
    .sort()
    .slice(0, 32)
  for (const path of files) {
    signal?.throwIfAborted()
    try {
      const pair = await inspectDecompositionPair(host, path, signal)
      if (
        pair.record?.decompositionId === id &&
        pair.textState !== 'pair_mismatch'
      )
        return pair
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof DecomposeError) throw error
    }
  }
  return null
}
