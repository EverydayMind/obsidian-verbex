import type { VectorMetaData } from '../../../database/schema'
import { SourceText } from '../sourceTextReader'

import { extractorKey } from './projection'

export function documentEmbeddingChunks(
  source: SourceText,
): { pageContent: string; metadata: VectorMetaData }[] {
  const document = source.document
  if (!document) return []
  const lines = source.text.split('\n')
  return document.chunks.map((chunk) => ({
    pageContent: lines
      .slice(chunk.startLine - 1, chunk.endLine)
      .join('\n')
      .split('\u0000')
      .join(''),
    metadata: {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      sourceKind: 'document' as const,
      format: document.format,
      ...(document.quality?.ocrCandidatePages.length
        ? { ocrCandidatePages: document.quality.ocrCandidatePages }
        : {}),
      ...(chunk.pageEnd ? { pageEnd: chunk.pageEnd } : {}),
      breadcrumb: chunk.breadcrumb,
      ...(chunk.page ? { page: chunk.page } : {}),
      blockRange: chunk.blockRange,
      extractorVersion: extractorKey(document),
      revisionHash: source.revision,
    },
  }))
}
