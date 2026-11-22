import { L } from '../../i18n/modelText'

import { ToolArgs, ToolExecutionContext, ToolResult } from './localToolCommon'
import { queryObsidianLines } from './obsidianQueryLines'
import { normalizeLinesCursor } from './obsidianQueryLinesSession'
import { queryObsidianNotes } from './obsidianQueryNotes'

/** Explicit mode wins on restart; otherwise a cursor-only call infers mode. */
export function queryObsidian(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const prefix =
    typeof args.cursor === 'string'
      ? normalizeLinesCursor(args.cursor).split(':')[0]
      : ''
  const lines =
    args.lines === true || (args.lines === undefined && prefix === 'ol1')
  let message = ''
  if (
    args.restart !== true &&
    ((args.lines === true && prefix === 'on1') ||
      (args.lines === false && prefix === 'ol1'))
  )
    message = L({
      ko: '모드와 cursor가 일치하지 않습니다.',
      en: 'Mode and cursor do not match.',
    })
  else if (lines && args.max_notes !== undefined)
    message = L({
      ko: '줄 모드에는 max_notes 인자가 없습니다.',
      en: 'Line mode does not accept max_notes.',
    })
  else if (
    !lines &&
    (args.line_terms !== undefined || args.max_lines !== undefined)
  )
    message = L({
      ko: '노트 모드에는 line_terms·max_lines 인자가 없습니다.',
      en: 'Note mode does not accept line_terms or max_lines.',
    })
  else if (!lines && args.limit !== undefined)
    message = L({
      ko: 'limit은 없어졌습니다. 노트 전부를 쪽으로 받습니다(max_notes)',
      en: 'limit has been removed. Receive all matching notes in pages (max_notes).',
    })
  if (message)
    return Promise.resolve({ kind: 'error', message, retryAllowed: false })
  return lines ? queryObsidianLines(args, ctx) : queryObsidianNotes(args, ctx)
}
