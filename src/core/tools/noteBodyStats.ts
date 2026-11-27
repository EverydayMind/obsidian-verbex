import { L } from '../../i18n/modelText'

export function noteBodyStats(content: string): string {
  const frontmatter = /^---\r?\n[\s\S]*?^---(?:\r?\n|$)/m.exec(content)
  const body =
    frontmatter?.index === 0 ? content.slice(frontmatter[0].length) : content
  const withoutNewlines = [...body.replace(/[\r\n]/g, '')].length
  const withoutWhitespace = [...body.replace(/\s/gu, '')].length
  const withNewlines = [...body].length
  const words = body.trim() ? body.trim().split(/\s+/u).length : 0
  return L({
    ko: `본문(속성 제외): 공백 포함 ${withoutNewlines}자(줄바꿈 제외) · 공백 제외 ${withoutWhitespace}자 · 줄바꿈 포함 ${withNewlines}자 · 낱말 ${words}개`,
    en: `Body (excluding frontmatter): ${withoutNewlines} characters including spaces (excluding line breaks) · ${withoutWhitespace} excluding whitespace · ${withNewlines} including line breaks · ${words} words`,
  })
}
