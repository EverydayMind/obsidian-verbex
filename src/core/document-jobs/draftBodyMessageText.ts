import { L } from '../../i18n/modelText'

export function draftBodyMessageText(points: number) {
  return L({
    ko: {
      no_body:
        '초안에 글자가 있는 문단이 없습니다(frontmatter·주석·빈 제목만 있음).',
      placeholder_only: '초안의 모든 문단이 괄호로만 된 자리표시입니다.',
      below_minimum: `초안의 자리표시가 아닌 글자가 ${points}자로 기계적 최소 200자보다 적습니다.`,
      suffix:
        ' 제목(#) 문단의 글자도 본문으로 셉니다. 제목 단계와 역할 지시는 지우지 마세요.',
    },
    en: {
      no_body:
        'The draft has no paragraphs containing text (only frontmatter, comments, or empty headings).',
      placeholder_only:
        'Every paragraph in the draft is a placeholder consisting only of brackets.',
      below_minimum: `The draft contains ${points} non-placeholder characters, below the mechanical minimum of 200.`,
      suffix:
        ' Text in heading (#) paragraphs also counts as body text. Do not remove heading levels or role directives.',
    },
  })
}
