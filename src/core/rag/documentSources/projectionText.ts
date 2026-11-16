import { type ModelLocale, getModelLocale } from '../../../i18n/modelLocale'
import { modelMarker } from '../../../i18n/modelMarkers'
import { L } from '../../../i18n/modelText'

import type { DocumentProjection, ExtractedChunk } from './types'

export function projectionHeader(
  path: string,
  chunk: ExtractedChunk,
  pageMode: DocumentProjection['pageMode'],
  locale: ModelLocale = getModelLocale(),
) {
  const location = chunk.page
    ? pageMode === 'layout'
      ? `p.${chunk.page}${chunk.pageEnd && chunk.pageEnd !== chunk.page ? '-' + String(chunk.pageEnd) : ''}`
      : L(
          {
            ko: `${chunk.page}${modelMarker('documentSection', 'ko')}`,
            en: `${modelMarker('documentSection', 'en')} ${chunk.page}`,
          },
          locale,
        )
    : ''
  return `[${[path.split('/').pop(), ...chunk.breadcrumb].join(' › ')}${location ? ' · ' + location : ''}]`
}

/** Cached bodies stay verbatim. Only exact host headers at typed chunk starts change. */
export function localizeProjectionHeaders(
  projection: DocumentProjection,
  locale: ModelLocale = getModelLocale(),
): DocumentProjection {
  const lines = projection.projection.split('\n')
  let changed = false
  for (const chunk of projection.chunks) {
    const index = chunk.startLine - 1
    const header = projectionHeader(
      projection.path,
      chunk,
      projection.pageMode,
      locale,
    )
    if (lines[index] === header) continue
    if (
      ['ko', 'en'].some(
        (candidate) =>
          lines[index] ===
          projectionHeader(
            projection.path,
            chunk,
            projection.pageMode,
            candidate as ModelLocale,
          ),
      )
    ) {
      lines[index] = header
      changed = true
    }
  }
  return changed ? { ...projection, projection: lines.join('\n') } : projection
}
