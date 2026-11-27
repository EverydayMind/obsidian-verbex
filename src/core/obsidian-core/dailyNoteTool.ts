import { moment, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { enabledCorePlugin } from '../obsidian-core/internalPlugins'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  changeHelper,
  str,
} from '../tools/localToolCommon'

import { corePluginDisabledError } from './corePluginMeta'
import { assertSafeWritePath, exactMarkdownFile } from './exactVaultFile'
import { insertUnderHeading } from './insertUnderHeading'
import { substituteDailyNoteTemplate } from './templateSubstitution'

type MomentValue = ReturnType<typeof moment>

export type DailyNotesOptions = {
  folder?: string
  format?: string
  template?: string
}

type DailyNotesPlugin = {
  options?: DailyNotesOptions
}

const MAX_RANGE_DAYS = 93
const READ_SAFETY_RATIO = 0.35

function cleanFolder(folder?: string): string {
  return (folder ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

export function dailyNotePath(
  date: MomentValue,
  options: DailyNotesOptions,
): string {
  const folder = cleanFolder(options.folder)
  const format = options.format?.trim() ? options.format.trim() : 'YYYY-MM-DD'
  const formatted = date.format(format)
  return normalizePath(folder ? `${folder}/${formatted}.md` : `${formatted}.md`)
}

function parseDateArg(
  raw: string | null,
  baseNow: MomentValue,
): MomentValue | null {
  if (!raw || raw.trim().toLowerCase() === 'today') {
    return baseNow.clone().startOf('day')
  }
  const lower = raw.trim().toLowerCase()
  if (lower === 'yesterday') {
    return baseNow.clone().startOf('day').subtract(1, 'day')
  }
  if (lower === 'tomorrow') {
    return baseNow.clone().startOf('day').add(1, 'day')
  }
  const parsed = moment(raw.trim(), 'YYYY-MM-DD', true)
  return parsed.isValid() ? parsed.startOf('day') : null
}

function parseAddLines(args: ToolArgs): string[] | string {
  if (args.add_lines === undefined) return []
  if (
    !Array.isArray(args.add_lines) ||
    args.add_lines.some((item) => typeof item !== 'string')
  ) {
    return L({
      ko: 'add_lines는 문자열 배열이어야 합니다.',
      en: 'add_lines must be an array of strings.',
    })
  }
  return args.add_lines as string[]
}

export async function executeDailyNoteTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
  now: () => MomentValue = () => moment(),
): Promise<ToolResult> {
  const plugin = enabledCorePlugin(
    ctx.app,
    'daily-notes',
  ) as DailyNotesPlugin | null
  if (!plugin) {
    return {
      kind: 'error',
      message: corePluginDisabledError('daily-notes'),
      retryAllowed: false,
    }
  }

  const options: DailyNotesOptions = plugin.options ?? {}
  const folder = cleanFolder(options.folder)
  const baseNow = now()

  if (args.date !== undefined && typeof args.date !== 'string') {
    return {
      kind: 'error',
      message: L({
        ko: 'date는 YYYY-MM-DD 또는 today/yesterday/tomorrow 문자열이어야 합니다.',
        en: 'date must be YYYY-MM-DD, today, yesterday, or tomorrow.',
      }),
    }
  }
  const startDate = parseDateArg(str(args, 'date'), baseNow)
  if (!startDate) {
    return {
      kind: 'error',
      message: L({
        ko: `유효하지 않은 날짜입니다: ${String(args.date)}. YYYY-MM-DD 또는 today/yesterday/tomorrow를 사용하세요.`,
        en: `Invalid date: ${String(args.date)}. Use YYYY-MM-DD, today, yesterday, or tomorrow.`,
      }),
    }
  }

  const addLines = parseAddLines(args)
  if (typeof addLines === 'string') return { kind: 'error', message: addLines }
  const create = args.create === true
  const underHeading = str(args, 'under_heading')

  if (args.end_date !== undefined) {
    if (typeof args.end_date !== 'string' || !args.end_date.trim()) {
      return {
        kind: 'error',
        message: L({
          ko: 'end_date는 YYYY-MM-DD 또는 today/yesterday/tomorrow 문자열이어야 합니다.',
          en: 'end_date must be YYYY-MM-DD, today, yesterday, or tomorrow.',
        }),
      }
    }
    if (create || addLines.length > 0) {
      return {
        kind: 'error',
        message: L({
          ko: '기간 조회(end_date)는 create 또는 add_lines와 함께 쓸 수 없습니다.',
          en: 'end_date cannot be combined with create or add_lines.',
        }),
      }
    }
    const endDate = parseDateArg(args.end_date, baseNow)
    if (!endDate) {
      return {
        kind: 'error',
        message: L({
          ko: `유효하지 않은 종료 날짜입니다: ${args.end_date}`,
          en: `Invalid end_date: ${args.end_date}`,
        }),
      }
    }
    if (endDate.isBefore(startDate, 'day')) {
      return {
        kind: 'error',
        message: L({
          ko: 'end_date는 date와 같거나 이후여야 합니다.',
          en: 'end_date must be on or after date.',
        }),
      }
    }
    const totalDays = endDate.diff(startDate, 'days') + 1
    if (totalDays > MAX_RANGE_DAYS) {
      return {
        kind: 'error',
        message: L({
          ko: `일일노트 기간 조회는 최대 ${MAX_RANGE_DAYS}일까지 지원합니다(요청: ${totalDays}일).`,
          en: `Daily note range lookup supports at most ${MAX_RANGE_DAYS} days (requested: ${totalDays}).`,
        }),
      }
    }

    const existingPaths: string[] = []
    let missingCount = 0
    const cursor = startDate.clone()
    while (!cursor.isAfter(endDate, 'day')) {
      const notePath = assertSafeWritePath(ctx, dailyNotePath(cursor, options))
      if (exactMarkdownFile(ctx.app, notePath)) {
        if (!existingPaths.includes(notePath)) existingPaths.push(notePath)
      } else {
        missingCount += 1
      }
      cursor.add(1, 'day')
    }
    const startIso = startDate.format('YYYY-MM-DD')
    const endIso = endDate.format('YYYY-MM-DD')
    const listLines = existingPaths.length
      ? existingPaths.map((path) => `- ${path}`)
      : [
          L({
            ko: '(해당 기간에 있는 일일노트 없음)',
            en: '(No daily notes in range)',
          }),
        ]
    const taskHint = L({
      ko: `할 일을 모으려면 list_tasks(folder: "${folder}", where: date >= "${startIso}" and date <= "${endIso}")를 사용하세요.`,
      en: `To collect tasks, use list_tasks(folder: "${folder}", where: date >= "${startIso}" and date <= "${endIso}").`,
    })
    return {
      kind: 'read',
      facts: {
        completeness: 'complete',
        total: totalDays,
        returned: existingPaths.length,
      },
      text: [
        L({
          ko: `일일노트 기간: ${startIso} ~ ${endIso} (총 ${totalDays}일, 있음 ${existingPaths.length}개, 없음 ${missingCount}일)`,
          en: `Daily notes range: ${startIso} to ${endIso} (${totalDays} days total, ${existingPaths.length} found, ${missingCount} missing)`,
        }),
        ...listLines,
        taskHint,
      ].join('\n'),
    }
  }

  const notePath = assertSafeWritePath(ctx, dailyNotePath(startDate, options))
  const existing = exactMarkdownFile(ctx.app, notePath)
  const isoDate = startDate.format('YYYY-MM-DD')

  if (!create && addLines.length === 0) {
    if (!existing) {
      return {
        kind: 'read',
        facts: { completeness: 'complete' },
        text: L({
          ko: `일일노트(${isoDate}): ${notePath}\n상태: 없음`,
          en: `Daily note (${isoDate}): ${notePath}\nStatus: missing`,
        }),
      }
    }
    assertNotAiPrivate(existing.path)
    const content = await ctx.app.vault.cachedRead(existing)
    const budget = Math.max(1_000, ctx.getContextBudget())
    const safetyThreshold = Math.max(
      1_000,
      Math.floor(budget * READ_SAFETY_RATIO),
    )
    const tokens = estimateTokens(content)
    if (tokens > safetyThreshold) {
      return {
        kind: 'read',
        facts: { completeness: 'partial', errorCode: 'budget' },
        text: L({
          ko: `일일노트(${isoDate}): ${existing.path}\n상태: 있음 (~${tokens} 토큰, 현재 읽기 예산 초과)\n본문을 생략했습니다. note_outline과 read_note_section으로 필요한 절만 읽으세요.`,
          en: `Daily note (${isoDate}): ${existing.path}\nStatus: exists (~${tokens} tokens, exceeds read budget)\nBody omitted. Use note_outline and read_note_section to inspect needed sections.`,
        }),
      }
    }
    return {
      kind: 'read',
      evidencePaths: [existing.path],
      facts: { completeness: 'complete' },
      text: [
        L({
          ko: `일일노트(${isoDate}): ${existing.path}\n상태: 있음`,
          en: `Daily note (${isoDate}): ${existing.path}\nStatus: exists`,
        }),
        '',
        content,
      ].join('\n'),
    }
  }

  if (existing) {
    assertNotAiPrivate(existing.path)
    if (addLines.length === 0) {
      return {
        kind: 'read',
        facts: { completeness: 'complete' },
        text: L({
          ko: `일일노트가 이미 있습니다: ${existing.path}`,
          en: `Daily note already exists: ${existing.path}`,
        }),
      }
    }
    const before = await ctx.app.vault.cachedRead(existing)
    const inserted = insertUnderHeading(before, underHeading, addLines)
    return changeHelper('daily_note', {
      op: 'modify',
      kind: 'body',
      path: existing.path,
      before,
      after: inserted.content,
      ...(inserted.fallbackNotice
        ? { approvalNotes: [inserted.fallbackNotice] }
        : {}),
    })
  }

  if (!create) {
    return {
      kind: 'error',
      message: L({
        ko: `일일노트가 아직 없습니다: ${notePath}. 만들려면 create: true로 호출하세요.`,
        en: `Daily note does not exist yet: ${notePath}. Pass create: true to create it.`,
      }),
    }
  }

  let body = ''
  let sourceDependencies: { path: string; beforeContent: string }[] | undefined
  const templateOpt = options.template?.trim() ?? ''
  if (templateOpt) {
    const rawTpl = templateOpt.toLowerCase().endsWith('.md')
      ? templateOpt
      : `${templateOpt}.md`
    const tplPath = normalizePath(rawTpl)
    const tplFile = exactMarkdownFile(ctx.app, tplPath)
    if (tplFile) {
      assertNotAiPrivate(tplFile.path)
      const tplRaw = await ctx.app.vault.cachedRead(tplFile)
      sourceDependencies = [{ path: tplFile.path, beforeContent: tplRaw }]
      const basename =
        notePath.split('/').pop()?.replace(/\.md$/i, '') ?? isoDate
      body = substituteDailyNoteTemplate(tplRaw, {
        title: basename,
        date: startDate,
        now: baseNow,
      })
    }
  }

  let fallbackNotice: string | undefined
  if (addLines.length > 0) {
    const inserted = insertUnderHeading(body, underHeading, addLines)
    body = inserted.content
    fallbackNotice = inserted.fallbackNotice
  }

  return changeHelper('daily_note', {
    op: 'create',
    kind: 'create',
    path: notePath,
    before: null,
    after: body,
    ...(sourceDependencies ? { sourceDependencies } : {}),
    ...(fallbackNotice ? { approvalNotes: [fallbackNotice] } : {}),
  })
}
