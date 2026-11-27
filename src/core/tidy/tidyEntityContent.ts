import { type App, type TFile, normalizePath } from 'obsidian'

import { noteFormat, noteFormatLocale } from '../../i18n/noteFormats'
import { enabledCorePlugin } from '../obsidian-core/internalPlugins'

import { buildLink } from './mentionLinks'
import {
  type Frontmatter,
  bodyOf,
  composeNote,
  mergeFrontmatter,
  readFrontmatter,
} from './tidyVault'

export function today(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function templatePath(app: App, entityType: string): string | null {
  const templates = enabledCorePlugin(app, 'templates') as {
    options?: { folder?: string }
  } | null
  const folder = templates?.options?.folder?.replace(/^\/+|\/+$/g, '')
  if (!folder) return null
  for (const name of [
    entityType,
    `entity-${entityType}`,
    `엔티티-${entityType}`,
  ]) {
    const path = normalizePath(`${folder}/${name}.md`)
    if (app.vault.getFileByPath(path)) return path
  }
  return null
}

export async function entityNoteContent(
  app: App,
  input: {
    title: string
    entityType: string
    aliases: string[]
    summary: string | null
    newPath: string
    source: { file: TFile; content: string }
  },
): Promise<string> {
  const templateFile = templatePath(app, input.entityType)
  let template = ''
  if (templateFile) {
    const file = app.vault.getFileByPath(templateFile)
    if (file)
      template = (await app.vault.read(file))
        .replace(/\{\{title\}\}/g, input.title)
        .replace(/\{\{date\}\}/g, today())
  }
  const ours: Frontmatter = {
    type: input.entityType,
    ...(input.aliases.length ? { aliases: input.aliases } : {}),
    created: today(),
  }
  const data = mergeFrontmatter(readFrontmatter(template), ours)
  const sourceLink = buildLink(
    app,
    input.source.file.path,
    input.newPath,
    input.source.file.basename,
  )
  const body = [
    bodyOf(template).trim(),
    input.summary?.trim() ?? '',
    `${noteFormat('relatedNotes', noteFormatLocale(template))}\n\n- ${sourceLink}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return composeNote(data, `${body}\n`)
}
