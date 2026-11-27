import { KORDOC_PROVIDER_ID } from '../../../provider/contract'

import { projectionPluginId } from './extractionIdentity'
import { projectionHeader } from './projectionText'
import { DocumentProjection, ExtractedChunk, IndexTextResult } from './types'

export function extractorKey(
  p: Pick<DocumentProjection, 'extractor' | 'pluginId' | 'chunkSize'>,
): string {
  // Projections of the KorDoc path keep their original key (no re-embedding).
  const owner = projectionPluginId(p)
  if (!p.extractor) return ''
  const prefix =
    p.extractor.id === 'kordoc' && owner === KORDOC_PROVIDER_ID
      ? 'kordoc'
      : `${owner ?? 'unknown'}/${p.extractor.id}`
  return `${prefix}:${p.extractor.engineVersion}:${p.extractor.chunkerVersion}:verbex-proj-2:size-${p.chunkSize}${p.extractor.ocrApplied ? ':ocr' : ''}`
}

/** Keep structure and repeat table headers; even a single huge row has a hard bound. */
export function splitDocumentChunk(
  chunk: ExtractedChunk,
  maxChars: number,
): ExtractedChunk[] {
  const size = Math.max(100, Math.floor(maxChars))
  if (chunk.text.length <= size) return [chunk]
  const lines = chunk.text.split('\n')
  // KORDOC can prepend captions or table identity comments before the GFM header.
  const separator =
    chunk.type === 'table'
      ? lines.findIndex((line) =>
          /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line),
        )
      : -1
  const header = separator > 0 ? lines.slice(0, separator + 1).join('\n') : ''
  const prefix = header.length < size / 2 ? header : ''
  const body = prefix ? lines.slice(separator + 1).join('\n') : chunk.text
  const parts: ExtractedChunk[] = []
  let current = ''
  const flush = () => {
    if (current)
      parts.push({
        ...chunk,
        id: `${chunk.id}:${parts.length}`,
        text: (prefix ? `${prefix}\n` : '') + current,
      })
    current = ''
  }
  const capacity = size - (prefix ? prefix.length + 1 : 0)
  for (const line of body.split('\n')) {
    if (current && current.length + line.length + 1 > capacity) flush()
    let rest = line
    while (rest.length > capacity) {
      flush()
      current = rest.slice(0, capacity)
      flush()
      rest = rest.slice(capacity)
    }
    current += (current ? '\n' : '') + rest
  }
  flush()
  return parts
}

export function buildProjection(
  path: string,
  stamp: { mtime: number; size: number },
  result: IndexTextResult,
  chunkSize: number,
): DocumentProjection {
  const base: DocumentProjection = {
    schemaVersion: 2,
    path,
    sourceStamp: stamp,
    status: result.status,
    sourceSha256: '',
    format: path.split('.').pop() ?? '',
    pageMode: /\.pdf$/i.test(path) ? 'layout' : 'section',
    segments: [],
    pageCount: result.status !== 'ok' ? (result.pageCount ?? null) : null,
    quality: result.quality,
    outline: [],
    projection: '',
    chunks: [],
    truncated: false,
    warnings: [],
    chunkSize,
  }
  if (result.status !== 'ok') return base
  const projected: string[] = []
  let line = 1
  for (const source of result.chunks) {
    for (const chunk of splitDocumentChunk(source, chunkSize)) {
      const header = projectionHeader(path, chunk, result.pageMode)
      const text = `${header}\n${chunk.text.replace(/\r\n?/g, '\n')}`
      const count = text.split('\n').length
      base.chunks.push({ ...chunk, startLine: line, endLine: line + count - 1 })
      projected.push(text)
      line += count + 1
    }
  }
  let segmentStart = 0,
    segmentChars = 0
  for (let i = 0; i < base.chunks.length; i++) {
    const chunk = base.chunks[i]
    segmentChars += chunk.text.length
    if (segmentChars >= 4000 || i === base.chunks.length - 1) {
      base.segments.push({
        id: `seg-${base.segments.length}`,
        startLine: base.chunks[segmentStart].startLine,
        endLine: chunk.endLine,
      })
      segmentStart = i + 1
      segmentChars = 0
    }
  }
  return {
    ...base,
    sourceSha256: result.sourceSha256,
    extractor: result.extractor,
    format: result.format,
    pageMode: result.pageMode,
    quality: result.quality,
    pageCount: result.pageCount,
    outline: result.outline,
    projection: projected.join('\n\n'),
    truncated: result.truncated,
    warnings: result.warnings,
  }
}
