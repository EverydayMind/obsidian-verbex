import { L } from '../../../i18n/modelText'
import type { JsonObject } from '../../../provider/interop/protocol'

import { codePoints, markdownParagraphs, plainInline } from './markdownFacts'
import { referenceExcerpt } from './referenceExcerpt'

export function rolePrefixes(
  markers: string[],
  prefixes: Record<string, string>,
) {
  return Object.fromEntries(
    markers
      .filter(
        (key) =>
          /^(H[1-6]|BODY)(?::(.+))?$/.test(key) &&
          Object.prototype.hasOwnProperty.call(prefixes, key),
      )
      .map((key) => [key, prefixes[key]]),
  )
}

export function v2Guidance(
  markers: string[],
  prefixes: Record<string, string>,
  markdown: string,
) {
  const paragraphs = markdownParagraphs(markdown)
  const roles: JsonObject = {}
  const mappings = new Set<string>()
  for (const marker of markers) {
    const match = /^(H[1-6]|BODY)(?::(.+))?$/.exec(marker)
    if (!match) continue
    const shape =
      match[1] === 'BODY'
        ? L({ ko: '일반 본문', en: 'plain body paragraph' })
        : '#'.repeat(Number(match[1].slice(1))) +
          L({ ko: ' 제목', en: ' heading' })
    const syntax = `${match[2] ? L({ ko: `바로 앞 줄에 <!--hwpx:${match[2]}-->; `, en: `on the immediately preceding line: <!--hwpx:${match[2]}-->; ` }) : ''}${shape}`
    const prefix = prefixes[marker] ?? ''
    const examples = paragraphs.filter((p) => p.key === marker && !p.list)
    roles[marker] = codePoints(
      `${syntax}.${prefix ? L({ ko: ` 템플릿이 붙이는 앞 글자: '${prefix}'.`, en: ` Prefix added by the template: '${prefix}'.` }) : ''}${examples.length ? L({ ko: ` 원본 예: '${codePoints(plainInline(examples[0].text), 40)}' (${examples.length}문단)`, en: ` Source example: '${codePoints(plainInline(examples[0].text), 40)}' (${examples.length} paragraphs)` }) : ''}`,
      500,
    )
    if (prefix.trim())
      mappings.add(`'${prefix.trim().replace(/\s+/g, ' ')}' → ${syntax}`)
  }
  return {
    roles,
    syntax_guidance:
      L({
        ko: '위계는 제목 단계(#~######)로 씁니다. 문단 앞에 기호·번호 글자(□ ㅇ - · * ※ 󰊱 ① 1.)를 쓰지 않습니다. 그 글자는 roles에 적힌 대로 템플릿이 붙입니다. Markdown 목록(-·*·1.)도 쓰지 않습니다. 역할 문단은 바로 앞 줄에 <!--hwpx:역할-->만 씁니다(뒤 부연은 선택). 6단계보다 깊으면 역할 지시 뒤 일반 문단으로 씁니다.',
        en: 'Express hierarchy using heading levels (# through ######). Do not write symbol or numbering prefixes (□ ㅇ - · * ※ 󰊱 ① 1.) before paragraphs. The template adds those characters as specified in roles. Do not use Markdown lists (-·*·1.) either. For role paragraphs, put only <!--hwpx:role--> on the immediately preceding line (an explanation after it is optional). Below level 6, use a plain paragraph after the role directive.',
      }) +
      (mappings.size
        ? L({ ko: ' 원본 앞 글자 대응: ', en: ' Source prefix mapping: ' }) +
          [...mappings].join(', ')
        : ''),
    reference_excerpt: referenceExcerpt(markdown),
  }
}
