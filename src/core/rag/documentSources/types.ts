export type DocumentIndexSettings = {
  enabled: boolean
  formats: { hwp: boolean; hwpx: boolean; pdf: boolean }
  ocr: 'off' | 'manual'
  autoMaxPages: number
  includePaths: string[]
  excludePaths: string[]
  embed: boolean
  embedConsentModelId?: string
  autoMaxBytes: number
}

export const DEFAULT_DOCUMENT_SETTINGS: DocumentIndexSettings = {
  enabled: false,
  formats: { hwp: true, hwpx: true, pdf: true },
  ocr: 'off',
  autoMaxPages: 500,
  includePaths: [],
  excludePaths: [],
  embed: false,
  autoMaxBytes: 30 * 1024 * 1024,
}

export type ExtractedChunk = {
  id: string
  type: 'heading' | 'text' | 'table'
  text: string
  breadcrumb: string[]
  page?: number
  pageEnd?: number
  blockRange: [number, number]
}
export type ExtractorVersion = {
  id: string
  engineVersion: string
  chunkerVersion: string
  ocrApplied: boolean
}
export type ExtractionFailure =
  | 'needs_ocr'
  | 'bomb'
  | 'encrypted'
  | 'drm'
  | 'unsupported'
  | 'corrupted'
  | 'too_large'
  | 'empty'
  | 'timeout'
  | 'too_large_auto'
  | 'extractor_unavailable'
export type IndexTextResult =
  | {
      status: 'ok'
      format: string
      sourceSha256: string
      sourceStamp: { mtime: number; size: number }
      extractor: ExtractorVersion
      pageMode: 'layout' | 'section' | null
      quality?: DocumentQuality
      pageCount: number | null
      outline: { level: number; text: string }[]
      chunks: ExtractedChunk[]
      truncated: boolean
      warnings: { code: string; count: number }[]
    }
  | {
      status: ExtractionFailure
      message: string
      pageCount?: number
      quality?: DocumentQuality
    }

export type DocumentProjection = {
  schemaVersion: 2
  path: string
  sourceStamp: { mtime: number; size: number }
  status: 'ok' | ExtractionFailure
  sourceSha256: string
  extractor?: ExtractorVersion
  /** Plugin that produced the projection; absent in older projections. */
  pluginId?: string
  format: string
  pageMode: 'layout' | 'section' | null
  quality?: DocumentQuality
  pageCount: number | null
  outline: { level: number; text: string }[]
  projection: string
  chunks: (ExtractedChunk & { startLine: number; endLine: number })[]
  truncated: boolean
  warnings: { code: string; count: number }[]
  chunkSize: number
  segments: { id: string; startLine: number; endLine: number }[]
}

export type DocumentQuality = {
  needsOcr?: boolean
  ocrCandidatePages: number[]
  lowTextPageCount?: number
}
