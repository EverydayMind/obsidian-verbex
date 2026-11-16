import { TFile } from 'obsidian'

import type { LexicalDocument } from '../../../context/LexicalIndex'
import { runtimeTimers } from '../../../platform/runtime'
import { computeTermFreq } from '../bm25'

import { DocumentProjection } from './types'

export async function documentLexicalSegments(
  file: TFile,
  projection: DocumentProjection,
): Promise<LexicalDocument[]> {
  if (projection.status !== 'ok' && projection.status !== 'needs_ocr') return []
  const lines = projection.projection.split('\n')
  const segments =
    projection.status === 'needs_ocr'
      ? [{ id: 'title', startLine: 1, endLine: 1 }]
      : projection.segments
  const documents: LexicalDocument[] = []
  for (const segment of segments) {
    if (documents.length % 8 === 0)
      await new Promise<void>((resolve) => runtimeTimers.setTimeout(resolve, 0))
    const content = lines
      .slice(segment.startLine - 1, segment.endLine)
      .join('\n')
    const headings = projection.chunks
      .filter(
        (c) =>
          c.startLine >= segment.startLine && c.startLine <= segment.endLine,
      )
      .flatMap((c) => c.breadcrumb)
    documents.push({
      path: `${file.path}#${segment.id}`,
      sourcePath: file.path,
      sourceKind: 'document',
      sourceSha256: projection.sourceSha256,
      startLine: segment.startLine,
      endLine: segment.endLine,
      mtime: file.stat.mtime,
      title: file.basename,
      headings,
      tags: [],
      links: [],
      aliases: [],
      needsOcr: projection.status === 'needs_ocr',
      ...(projection.quality?.ocrCandidatePages.length
        ? { documentOcrCandidatePages: projection.quality.ocrCandidatePages }
        : {}),
      ...computeTermFreq(
        [file.basename, file.basename, ...headings, content].join('\n'),
      ),
    })
  }
  return documents
}

export function dropLexicalSource(
  documents: Map<string, LexicalDocument>,
  path: string,
): boolean {
  let changed = false
  for (const [key, document] of documents) {
    if ((document.sourcePath ?? document.path) === path) {
      documents.delete(key)
      changed = true
    }
  }
  return changed
}
