import { DocumentProjection } from './types'

export const locator = (p: DocumentProjection, start: number, end: number) =>
  p.chunks
    .filter((chunk) => chunk.startLine <= end && chunk.endLine >= start)
    .map((chunk) => ({
      id: chunk.id,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      page: chunk.page,
      pageEnd: chunk.pageEnd,
      blockRange: chunk.blockRange,
      breadcrumb: chunk.breadcrumb,
    }))

export function tableHeaders(
  p: DocumentProjection,
  start: number,
  end: number,
) {
  return p.chunks
    .filter(
      (c) => c.type === 'table' && c.startLine <= end && c.endLine >= start,
    )
    .flatMap((c) => {
      const rows = c.text.split('\n')
      const separator = rows.findIndex((row) =>
        /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row),
      )
      return separator > 0
        ? [
            {
              startLine: c.startLine + 1,
              endLine: c.startLine + separator + 1,
              text: rows.slice(0, separator + 1).join('\n'),
            },
          ]
        : []
    })
}
