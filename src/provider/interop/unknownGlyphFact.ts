import type { glyphObservations } from '../../core/document-jobs/decompose/glyphObservations'
import {
  codePoints,
  plainInline,
} from '../../core/document-jobs/decompose/markdownFacts'
import { L } from '../../i18n/modelText'

export function unknownGlyphFact(
  group: ReturnType<typeof glyphObservations>,
): string {
  return L({
    ko: `기호·번호 글자로 시작하는 문단 ${group.length}개(예: ${group
      .slice(0, 3)
      .map(
        ({ paragraph: p }) =>
          `${p.line}행 "${codePoints(plainInline(p.text), 20)}"`,
      )
      .join(
        ', ',
      )}). v2 초안은 위계를 제목 단계로 쓰고, 기호·번호는 템플릿이 roles의 앞 글자로 붙입니다. 이 글자는 출력에 그대로 남아 템플릿 앞 글자와 겹칠 수 있습니다.`,
    en: `${group.length} paragraphs start with symbols/numbering characters (e.g. ${group
      .slice(0, 3)
      .map(
        ({ paragraph: p }) =>
          `line ${p.line} "${codePoints(plainInline(p.text), 20)}"`,
      )
      .join(
        ', ',
      )}). In v2 drafts, express hierarchy with heading levels; the template adds symbols/numbering from roles prefixes. These characters remain in output and may duplicate template prefixes.`,
  })
}
