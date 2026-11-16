import { App, Notice } from 'obsidian'

import { t } from '../i18n'

import { sha256Hex } from './hash'
import { openMarkdownFile } from './obsidian'

export type SourceCitation = {
  path: string
  startLine: number
  endLine: number
  hash: string
}

function lineSlice(text: string, start: number, end: number): string | null {
  const lines = text.split(/\r?\n/)
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end > lines.length
  )
    return null
  return lines.slice(start - 1, end).join('\n')
}

/** Only issue a location when the retrieved text is actually present there. */
export async function createSourceCitation(
  path: string,
  text: string,
  startLine: number,
  endLine: number,
  excerpt: string,
  compact = false,
): Promise<SourceCitation | null> {
  if (
    !/\.md$/i.test(path) ||
    ['#', '|', '[', ']', '\\', '\r', '\n'].some((char) => path.includes(char))
  )
    return null
  const slice = lineSlice(text, startLine, endLine)
  if (slice === null || !excerpt.trim()) return null
  const normalize = (value: string) =>
    compact
      ? value.replace(/\s+/g, ' ').trim()
      : value.replace(/\r\n/g, '\n').trim()
  const needle = normalize(compact ? excerpt.replace(/…$/, '') : excerpt)
  if (!needle || !normalize(slice).includes(needle)) return null
  return { path, startLine, endLine, hash: await sha256Hex(slice) }
}

export function citationLink(citation: SourceCitation): string {
  const { path, startLine, endLine, hash } = citation
  return `[[${path}#verbex-L${startLine}-L${endLine}-${hash}|${path} · L${startLine}${endLine === startLine ? '' : `–${endLine}`}]]`
}

export function parseCitationLink(link: string): SourceCitation | null {
  const match =
    /^(.*\.md)#verbex-L([1-9]\d*)-L([1-9]\d*)-([a-f0-9]{64})$/i.exec(link)
  if (!match) return null
  const startLine = Number(match[2]),
    endLine = Number(match[3])
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    endLine < startLine
  )
    return null
  return { path: match[1], startLine, endLine, hash: match[4].toLowerCase() }
}

export async function openSourceCitation(
  app: App,
  citation: SourceCitation,
  newTab = false,
): Promise<void> {
  const file = app.vault.getFileByPath(citation.path)
  if (!file) return
  let valid = false
  try {
    const slice = lineSlice(
      await app.vault.cachedRead(file),
      citation.startLine,
      citation.endLine,
    )
    valid = slice !== null && (await sha256Hex(slice)) === citation.hash
  } catch {
    /* open the file without an unverified position */
  }
  if (!valid)
    new Notice(t('ui.sourceCitation.sourceContentChangedOpeningTheNoteOnly'))
  openMarkdownFile(app, citation.path, valid ? citation.startLine : undefined, {
    newTab,
  })
}
