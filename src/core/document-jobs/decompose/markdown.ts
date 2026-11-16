import * as modelText from '../documentContractText'

import { DecomposeError, type Model, type Projection, RULES } from './types'

export const commentText = (text: string) => text.replace(/-->/g, '--&gt;')
/** Escape literal source text before adding any of our Markdown syntax. */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]<>!|&])/g, '\\$1')
    .replace(/^(\s*)([#>+-])/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])/gm, '$1\\$2')
}
const html = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
function tableMarkdown(b: Projection): string {
  const t = b.table
  if (!t) throw new DecomposeError('missing_table', [b.ref])
  if (b.cells.some((c) => c.rowSpan > 1 || c.colSpan > 1)) {
    const rows = Array.from(
      { length: t.rows },
      (_, row) =>
        '<tr>' +
        b.cells
          .filter((c) => c.row === row)
          .sort((a, b) => a.col - b.col)
          .map(
            (c) =>
              `<td rowspan="${c.rowSpan}" colspan="${c.colSpan}">${html(c.text).replace(/\n/g, '<br>')}</td>`,
          )
          .join('') +
        '</tr>',
    )
    return `<table>\n${rows.join('\n')}\n</table>`
  }
  const rows = Array.from(
    { length: t.rows },
    (_, row) =>
      '| ' +
      Array.from({ length: t.cols }, (_, col) =>
        escapeText(
          b.cells.find((c) => c.row === row && c.col === col)?.text ?? '',
        ).replace(/\n/g, '<br>'),
      ).join(' | ') +
      ' |',
  )
  rows.splice(
    1,
    0,
    '| ' + Array.from({ length: t.cols }, () => '---').join(' | ') + ' |',
  )
  return rows.join('\n')
}
export function blockMarkdown(b: Projection): string {
  if (/^H\d+$/.test(b.role) && Number(b.role.slice(1)) > RULES.maxHeadingLevel)
    throw new DecomposeError('heading_limit', [b.ref])
  const omitted = b.omittedObjects.map(
    (o) =>
      `<!-- hwpx:omitted kind=${commentText(o.kind)} ref=${commentText(o.ref)} -->`,
  )
  let text = b.text.trim()
  if (b.role === 'spacer') return ''
  if (b.role === 'omitted')
    return `<!-- hwpx:omitted kind=block ref=${commentText(b.ref)} -->`
  if (b.role === 'data_table') text = tableMarkdown(b)
  else if (/^H[1-6]$/.test(b.role))
    text = `${'#'.repeat(Number(b.role.slice(1)))} ${escapeText(b.headingText ?? text)}`
  else if (b.role === '-') text = '- ' + escapeText(text.replace(/^-\s*/, ''))
  else if (b.role === 'BODY:META') {
    const match = text.match(/^([^:：]+)[:：]\s*([\s\S]*)$/)
    text = match
      ? `**${escapeText(match[1])}**: ${escapeText(match[2])}`
      : escapeText(text)
  } else {
    text = escapeText(text)
    if (b.role.startsWith('BODY:'))
      text = `<!-- hwpx:style=${commentText(b.role.slice(5))} -->\n\n${text}`
  }
  return [...omitted, text].filter(Boolean).join('\n\n')
}
export function writeDecompositionMarkdown(input: {
  model: Model
  templateName: string
  decompositionId: string
  sourceSha256: string
}): string {
  const { model } = input
  if (!input.templateName || /[\r\n[\]]/.test(input.templateName))
    throw new DecomposeError('invalid_name')
  const values = {
    ...model.meta,
    'hwpx-template': `[[${input.templateName}]]`,
    'hwpx-decomposition': input.decompositionId,
    'hwpx-source-sha256': input.sourceSha256,
    'hwpx-dialect': 'hwpx-exporter-md/2',
  }
  const frontmatter = [
    '---',
    ...Object.entries(values).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
    '---',
  ].join('\n')
  const fixed = model.fixedBlocks
    .flatMap((b) => [b.text, ...b.cells.map((c) => c.text)])
    .filter((t) => t.trim())
    .join('\n')
  const reference = fixed
    ? modelText.fixedRegionReference(commentText(fixed))
    : ''
  const result =
    [frontmatter, reference, ...model.blocks.map(blockMarkdown)]
      .filter(Boolean)
      .join('\n\n') + '\n'
  if (new TextEncoder().encode(result).length > RULES.textBytes)
    throw new DecomposeError('too_large')
  return result
}
