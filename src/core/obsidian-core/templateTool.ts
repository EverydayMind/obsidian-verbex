import { type App, type TFile, moment, normalizePath } from 'obsidian'

import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import { enabledCorePlugin } from '../obsidian-core/internalPlugins'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  changeHelper,
  str,
} from '../tools/localToolCommon'
import { parseHeadings, splitLines } from '../tools/noteSlicing'

import { corePluginDisabledError } from './corePluginMeta'
import { assertSafeWritePath, exactMarkdownFile } from './exactVaultFile'
import { insertUnderHeading } from './insertUnderHeading'
import { substituteTemplate } from './templateSubstitution'

type MomentValue = ReturnType<typeof moment>

export type TemplatesOptions = {
  folder?: string
  dateFormat?: string
  timeFormat?: string
}

type TemplatesPlugin = {
  options?: TemplatesOptions
}

function cleanFolder(folder?: string): string {
  return (folder ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

function templateFilesIn(app: App, folder: string): TFile[] {
  const prefix = folder ? `${folder}/` : ''
  return app.vault
    .getMarkdownFiles()
    .filter((file) => {
      const p = normalizePath(file.path)
      return file.extension === 'md' && (!prefix || p.startsWith(prefix))
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function withMdExtension(value: string): string {
  return value.toLowerCase().endsWith('.md') ? value : `${value}.md`
}

function resolveTemplateFile(
  app: App,
  query: string,
  folder: string,
): { file: TFile } | { error: string } {
  const trimmed = query.trim()
  if (trimmed.includes('/')) {
    const direct = exactMarkdownFile(app, withMdExtension(trimmed))
    if (direct) return { file: direct }
    if (folder) {
      const under = exactMarkdownFile(
        app,
        withMdExtension(`${folder}/${trimmed}`),
      )
      if (under) return { file: under }
    }
    return {
      error: L({
        ko: `템플릿을 찾지 못했습니다: ${trimmed}`,
        en: `Template not found: ${trimmed}`,
      }),
    }
  }

  if (!folder) {
    const direct = exactMarkdownFile(app, withMdExtension(trimmed))
    if (direct) return { file: direct }
    return {
      error: L({
        ko: `템플릿 폴더가 설정되어 있지 않고 '${trimmed}' 경로에도 템플릿이 없습니다.`,
        en: `No template folder is configured and no template exists at '${trimmed}'.`,
      }),
    }
  }

  const wantedName = trimmed.replace(/\.md$/i, '').toLowerCase()
  const candidates = templateFilesIn(app, folder).filter(
    (file) => file.basename.toLowerCase() === wantedName,
  )
  if (candidates.length === 1) return { file: candidates[0] }
  if (candidates.length > 1) {
    return {
      error: L({
        ko: `이름이 '${trimmed}'인 템플릿이 여러 개입니다. 정확한 경로를 지정하세요:\n${candidates.map((c) => `- ${c.path}`).join('\n')}`,
        en: `Multiple templates match '${trimmed}'. Specify the exact path:\n${candidates.map((c) => `- ${c.path}`).join('\n')}`,
      }),
    }
  }
  const available = templateFilesIn(app, folder)
    .slice(0, 10)
    .map((f) => f.path)
  return {
    error: L({
      ko: available.length
        ? `템플릿 폴더(${folder})에서 '${trimmed}'을(를) 찾지 못했습니다. 사용 가능한 템플릿: ${available.join(', ')}`
        : `템플릿 폴더(${folder})에 템플릿이 없습니다.`,
      en: available.length
        ? `Template '${trimmed}' was not found in ${folder}. Available templates: ${available.join(', ')}`
        : `No templates found in ${folder}.`,
    }),
  }
}

async function listTemplates(app: App, folder: string): Promise<ToolResult> {
  if (!folder) {
    return {
      kind: 'read',
      facts: { completeness: 'empty', total: 0, returned: 0 },
      text: L({
        ko: 'Obsidian 템플릿(Templates) 설정에 템플릿 폴더가 지정되어 있지 않습니다.',
        en: 'No template folder is configured in Obsidian Templates settings.',
      }),
    }
  }
  const files = templateFilesIn(app, folder)
  if (files.length === 0) {
    return {
      kind: 'read',
      facts: { completeness: 'empty', total: 0, returned: 0 },
      text: L({
        ko: `템플릿 폴더(${folder})에 Markdown 템플릿이 없습니다.`,
        en: `No Markdown templates found in ${folder}.`,
      }),
    }
  }
  const rows: string[] = []
  for (const file of files) {
    if (isAiPrivatePath(file.path)) {
      rows.push(
        L({
          ko: `- ${file.path} (AI 비공개)`,
          en: `- ${file.path} (AI-private)`,
        }),
      )
      continue
    }
    const content = await app.vault.cachedRead(file)
    const headings = parseHeadings(splitLines(content))
    const firstTitle =
      headings[0]?.heading ?? L({ ko: '(제목 없음)', en: '(no title)' })
    const h2 = headings
      .filter((item) => item.level === 2)
      .map((item) => item.heading)
    const sectionPart = h2.length
      ? L({
          ko: ` | ## 절: ${h2.join(', ')}`,
          en: ` | ## sections: ${h2.join(', ')}`,
        })
      : ''
    rows.push(`- ${file.path} — ${firstTitle}${sectionPart}`)
  }
  return {
    kind: 'read',
    facts: {
      completeness: 'complete',
      total: files.length,
      returned: files.length,
    },
    text: [
      L({
        ko: `템플릿 폴더: ${folder} (${files.length}개)`,
        en: `Templates folder: ${folder} (${files.length})`,
      }),
      ...rows,
    ].join('\n'),
  }
}

function resolveTargetPath(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): string | { error: string } {
  const pathArg = str(args, 'path')?.trim()
  if (pathArg) {
    const extMatch = /\.([^./]+)$/.exec(pathArg)
    if (extMatch && extMatch[1].toLowerCase() !== 'md') {
      return {
        error: L({
          ko: 'create_from_template 대상 경로는 .md 파일이어야 합니다.',
          en: 'create_from_template target path must be a .md file.',
        }),
      }
    }
    return assertSafeWritePath(ctx, withMdExtension(pathArg))
  }
  const titleArg = str(args, 'title')?.trim()
  const hasFolder = typeof args.folder === 'string'
  if (titleArg && hasFolder) {
    const folder = cleanFolder(args.folder as string)
    const title = titleArg.replace(/\.md$/i, '')
    if (!title || /[\\/]/.test(title)) {
      return {
        error: L({
          ko: 'title에는 폴더 구분자(/ 또는 \\)를 넣을 수 없습니다.',
          en: 'title must not contain path separators (/ or \\).',
        }),
      }
    }
    const combined = folder ? `${folder}/${title}.md` : `${title}.md`
    return assertSafeWritePath(ctx, combined)
  }
  return {
    error: L({
      ko: 'create_from_template은 path 또는 title과 folder 둘 다 필요합니다.',
      en: 'create_from_template requires either path or both title and folder.',
    }),
  }
}

function buildReferenceMoment(
  args: ToolArgs,
  baseNow: MomentValue,
): MomentValue | string {
  const ref = baseNow.clone()
  if (args.date !== undefined) {
    if (typeof args.date !== 'string') {
      return L({
        ko: 'date는 YYYY-MM-DD 형식 문자열이어야 합니다.',
        en: 'date must be a YYYY-MM-DD string.',
      })
    }
    const parsedDate = moment(args.date.trim(), 'YYYY-MM-DD', true)
    if (!parsedDate.isValid()) {
      return L({
        ko: `유효하지 않은 날짜입니다: ${args.date}. YYYY-MM-DD 형식을 사용하세요.`,
        en: `Invalid date: ${args.date}. Use YYYY-MM-DD.`,
      })
    }
    ref
      .year(parsedDate.year())
      .month(parsedDate.month())
      .date(parsedDate.date())
  }
  if (args.time !== undefined) {
    if (typeof args.time !== 'string') {
      return L({
        ko: 'time은 HH:mm 형식 문자열이어야 합니다.',
        en: 'time must be an HH:mm string.',
      })
    }
    const parsedTime = moment(args.time.trim(), 'HH:mm', true)
    if (!parsedTime.isValid()) {
      return L({
        ko: `유효하지 않은 시각입니다: ${args.time}. HH:mm 형식을 사용하세요.`,
        en: `Invalid time: ${args.time}. Use HH:mm.`,
      })
    }
    ref
      .hour(parsedTime.hour())
      .minute(parsedTime.minute())
      .second(0)
      .millisecond(0)
  }
  return ref
}

export async function executeTemplateTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
  now: () => MomentValue = () => moment(),
): Promise<ToolResult> {
  const plugin = enabledCorePlugin(
    ctx.app,
    'templates',
  ) as TemplatesPlugin | null
  if (!plugin) {
    return {
      kind: 'error',
      message: corePluginDisabledError('templates'),
      retryAllowed: false,
    }
  }

  const options: TemplatesOptions = plugin.options ?? {}
  const folder = cleanFolder(options.folder)
  const templateArg = str(args, 'template')?.trim()
  if (!templateArg) {
    return listTemplates(ctx.app, folder)
  }

  const resolved = resolveTemplateFile(ctx.app, templateArg, folder)
  if ('error' in resolved) return { kind: 'error', message: resolved.error }

  const target = resolveTargetPath(args, ctx)
  if (typeof target !== 'string') {
    return { kind: 'error', message: target.error }
  }

  const exists =
    exactMarkdownFile(ctx.app, target) !== null ||
    Boolean(await ctx.app.vault.adapter?.exists?.(target))
  if (exists) {
    return {
      kind: 'error',
      message: L({
        ko: `대상 노트가 이미 있어 덮어쓸 수 없습니다: ${target}`,
        en: `Target note already exists and cannot be overwritten: ${target}`,
      }),
    }
  }

  const refMoment = buildReferenceMoment(args, now())
  if (typeof refMoment === 'string') {
    return { kind: 'error', message: refMoment }
  }

  if (
    args.add_lines !== undefined &&
    (!Array.isArray(args.add_lines) ||
      args.add_lines.some((item) => typeof item !== 'string'))
  ) {
    return {
      kind: 'error',
      message: L({
        ko: 'add_lines는 문자열 배열이어야 합니다.',
        en: 'add_lines must be an array of strings.',
      }),
    }
  }
  const addLines = (args.add_lines as string[] | undefined) ?? []

  assertNotAiPrivate(resolved.file.path)
  const templateRaw = await ctx.app.vault.cachedRead(resolved.file)
  const basename = target.split('/').pop()?.replace(/\.md$/i, '') ?? ''

  let after = substituteTemplate(templateRaw, {
    title: basename,
    dateFormat: options.dateFormat,
    timeFormat: options.timeFormat,
    now: refMoment,
  })
  let fallbackNotice: string | undefined
  if (addLines.length > 0) {
    const inserted = insertUnderHeading(
      after,
      str(args, 'under_heading'),
      addLines,
    )
    after = inserted.content
    fallbackNotice = inserted.fallbackNotice
  }

  return changeHelper('create_from_template', {
    op: 'create',
    kind: 'create',
    path: target,
    before: null,
    after,
    sourceDependencies: [
      { path: resolved.file.path, beforeContent: templateRaw },
    ],
    ...(fallbackNotice ? { approvalNotes: [fallbackNotice] } : {}),
  })
}
