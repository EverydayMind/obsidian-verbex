import { classifyMarker, sectionNumber } from './hierarchy/markers'
import { type MarkdownParagraph, plainInline } from './markdownFacts'

export function glyphObservations(
  paragraphs: MarkdownParagraph[],
  prefixes?: Record<string, string>,
) {
  return paragraphs.flatMap((paragraph) => {
    const text = plainInline(paragraph.text)
    const symbol = classifyMarker(text).symbol ?? sectionNumber(text)
    if (!symbol) return []
    const prefix =
      prefixes && Object.prototype.hasOwnProperty.call(prefixes, paragraph.key)
        ? prefixes[paragraph.key]
        : undefined
    const kind =
      prefix === undefined
        ? 'unknown'
        : prefix.trim()
          ? 'prefixed'
          : 'unprefixed'
    return [{ paragraph, symbol, prefix, kind }]
  })
}
