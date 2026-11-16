import { glyphObservations } from '../../core/document-jobs/decompose/glyphObservations'
import { markdownParagraphs } from '../../core/document-jobs/decompose/markdownFacts'
import { L } from '../../i18n/modelText'

import { unknownGlyphFact } from './unknownGlyphFact'

export function documentJobGlyphFacts(
  text: string,
  prefixes?: Record<string, string>,
): string[] {
  const glyphs = glyphObservations(markdownParagraphs(text), prefixes)
  const lines: string[] = []
  for (const kind of ['prefixed', 'unprefixed', 'unknown'] as const) {
    const group = glyphs.filter((g) => g.kind === kind)
    if (!group.length) continue
    if (kind === 'unknown') {
      lines.push(unknownGlyphFact(group))
    } else {
      const examples = group
        .slice(0, 3)
        .map(({ paragraph: p, symbol, prefix }) =>
          kind === 'prefixed'
            ? L({
                ko: `${p.line}행(${p.key})은 '${symbol}'로 시작합니다. 템플릿이 이 역할에 앞 글자 '${(prefix ?? '').trim().replace(/\s+/g, ' ')}'를 붙이므로, 출력에는 템플릿 앞 글자와 이 글자가 함께 나옵니다.`,
                en: `Line ${p.line} (${p.key}) starts with '${symbol}'. The template adds prefix '${(prefix ?? '').trim().replace(/\s+/g, ' ')}' to this role, so both the template prefix and this character appear in output.`,
              })
            : L({
                ko: `${p.line}행(${p.key})은 '${symbol}'로 시작합니다. 이 역할에는 템플릿 앞 글자가 없어 쓴 그대로 출력됩니다.`,
                en: `Line ${p.line} (${p.key}) starts with '${symbol}'. This role has no template prefix, so the text is output as written.`,
              }),
        )
      lines.push(
        L({
          ko: `기호·번호 글자로 시작하는 문단 ${group.length}개. ${examples.join(' ')}`,
          en: `${group.length} paragraphs start with symbols/numbering characters. ${examples.join(' ')}`,
        }),
      )
    }
  }
  return lines
}
