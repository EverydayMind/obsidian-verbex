import { L } from '../../i18n/modelText'
import { normalizePropertyLink } from '../../utils/propertyLinks'

import { ToolArgs, ToolExecutionContext, ToolResult } from './localToolCommon'
import {
  distribution,
  filterLine,
  fmKey,
  matchProperty,
  parsePropertyQuery,
  show,
} from './propertyMatch'
import { queryPropertyExhaustive } from './propertyQueryExhaustive'

export { pageNumber } from './propertyMatch'

export function queryProperty(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): ToolResult {
  const spec = parsePropertyQuery(args)
  if ('error' in spec) return { kind: 'error', message: spec.error }
  // Only the explicit option starts a host-owned snapshot; prose such as
  // "모두" never switches the mode (DECISIONS §4).
  if (args.exhaustive === true) return queryPropertyExhaustive(spec, args, ctx)
  const { prop, value, limit, fields } = spec
  const offset = spec.offset ?? 0
  const { matched, matches } = matchProperty(spec, ctx.app)
  const page = matches.slice(offset, offset + limit)
  const nextOffset =
    offset + page.length < matches.length ? offset + page.length : undefined
  const rows = page.map(({ file, fm, actual }, i) => {
    const normalized = (Array.isArray(actual) ? actual : [actual]).map((v) =>
      normalizePropertyLink(v, ctx.app, file.path),
    )
    const plain = (Array.isArray(actual) ? actual : [actual]).map((v) =>
      String(v ?? '')
        .trim()
        .toLowerCase(),
    )
    return `${offset + i + 1}. ${file.path}\t${prop}=${show(actual)}${show(normalized) === show(plain) ? '' : `\tnormalized=${show(normalized)}`}${fields.map((key) => `\t${key}=${show(fm[fmKey(fm, key) ?? key])}`).join('')}`
  })
  const distLines = fields.map((f) => `\n${distribution(matched, f)}`).join('')
  return {
    kind: 'read',
    evidencePaths: page.map(({ file }) => file.path),
    facts: {
      completeness:
        nextOffset !== undefined
          ? 'partial'
          : matches.length
            ? 'complete'
            : 'empty',
      total: matches.length,
      returned: page.length,
      ...(nextOffset !== undefined
        ? { nextOffset, errorCode: 'limit' as const }
        : {}),
    },
    text: L({
      ko: `Property ${prop}=${show(value)} — 전체 ${matches.length}개, offset ${offset}–${offset + page.length}${filterLine(spec, matches.length, matched.length)}${distLines}\n행 상세는 next=note_context/read_frontmatter${nextOffset !== undefined ? `\n미완료: ${matches.length - nextOffset}개 남음. 전체 목록이면 offset=${nextOffset}로 이어서 호출하기 전에는 "모두/최종"이라고 답하지 마세요. 전수 확인이 필요하면 exhaustive=true로 host가 고정 목록을 순회하게 하세요.` : ''}\n${rows.join('\n')}${nextOffset !== undefined ? `\n... omitted ${matches.length - nextOffset} note(s); next offset=${nextOffset}` : ''}`,
      en: `Property ${prop}=${show(value)} — total ${matches.length}, offset ${offset}–${offset + page.length}${filterLine(spec, matches.length, matched.length)}${distLines}
Row details: next=note_context/read_frontmatter${
        nextOffset !== undefined
          ? `\nIncomplete: ${matches.length - nextOffset} remaining. For a full list, do not answer "all/final" before continuing with offset=${nextOffset}. For exhaustive coverage, use exhaustive=true so the host traverses a fixed list.`
          : ''
      }
${rows.join('\n')}${nextOffset !== undefined ? `\n... omitted ${matches.length - nextOffset} note(s); next offset=${nextOffset}` : ''}`,
    }),
  }
}
