import { directiveLines, directiveName } from './inlineDirectives'

export type MarkdownParagraph = {
  text: string
  line: number
  key: string
  role?: { name: string; line: number }
  list: boolean
}

export const codePoints = (text: string, max: number) =>
  [...text].slice(0, max).join('')
export const markdownBody = (text: string) =>
  text.replace(
    /^\uFEFF?---[^\S\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\n]*(?:\r?\n|$)/,
    '',
  )
export const plainInline = (text: string) =>
  text
    .replace(/<!--[^]*?-->/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(?<!\\)([*_])(?=\S)(.+?)\1/g, '$2')
    .replace(/\\([\\`*{}[\]()#+.!_>~-])/g, '$1')

/** Structural facts only. Comments, fences and tables never become paragraphs. */
export function markdownParagraphs(markdown: string): MarkdownParagraph[] {
  const lines = markdown.split(/\r?\n/)
  const originalBody = markdownBody(markdown)
  const offset = lines.length - originalBody.split(/\r?\n/).length
  const entries = directiveLines(originalBody)
  const body = entries.map((entry) => entry.text)
  const result: MarkdownParagraph[] = []
  let fence = '',
    comment = false,
    inTable = false
  let role: MarkdownParagraph['role']
  let paragraph: MarkdownParagraph | undefined
  const flush = () => {
    if (paragraph) result.push(paragraph)
    paragraph = undefined
  }
  for (let i = 0; i < body.length; i++) {
    const raw = body[i],
      line = entries[i].line + offset
    const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(raw)?.[1]
    if (fence) {
      if (
        delimiter?.[0] === fence[0] &&
        delimiter.length >= fence.length &&
        /^ {0,3}(?:`+|~+)\s*$/.test(raw)
      )
        fence = ''
      continue
    }
    if (delimiter) {
      flush()
      role = undefined
      fence = delimiter
      continue
    }
    if (comment) {
      if (raw.includes('-->')) comment = false
      continue
    }
    const directive = directiveName(raw)
    if (directive) {
      flush()
      role = { name: directive, line }
      continue
    }
    if (/^\s*<!--/.test(raw)) {
      flush()
      role = undefined
      comment = !raw.includes('-->')
      continue
    }
    if (!raw.trim()) {
      flush()
      inTable = false
      continue
    }
    const table =
      raw.includes('|') &&
      (raw.trimStart().startsWith('|') ||
        /^\s*\|?\s*:?-{3,}/.test(body[i + 1] ?? ''))
    if (
      table ||
      (inTable && raw.includes('|')) ||
      /^ {0,3}(?:([-*_])\s*){3,}$/.test(raw)
    ) {
      flush()
      role = undefined
      inTable = table || inTable
      continue
    }
    inTable = false
    if (/^(?: {4}|\t| {0,3}>)/.test(raw) && !paragraph?.list) {
      flush()
      role = undefined
      continue
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/.exec(raw)
    const list = /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]+(.*)$/.exec(raw)
    const setext =
      !heading && !list && /^ {0,3}(=+|-+)\s*$/.exec(body[i + 1] ?? '')
    if (heading || list || setext) flush()
    const level = heading
      ? heading[1].length
      : setext
        ? setext[1].startsWith('=')
          ? 1
          : 2
        : 0
    const key = level ? `H${level}` : 'BODY'
    if (!paragraph) {
      paragraph = {
        text: heading
          ? heading[2].replace(/[ \t]+#+\s*$/, '')
          : list
            ? list[1]
            : raw.trim(),
        line,
        key: role ? `${key}:${role.name}` : key,
        ...(role ? { role } : {}),
        list: !!list,
      }
      role = undefined
    } else paragraph.text += ' ' + raw.trim()
    if (setext) i++
    if (heading || setext) flush()
  }
  flush()
  return result
}
