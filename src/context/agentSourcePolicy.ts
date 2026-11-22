import type { TFile } from 'obsidian'

import type { RequestMessage } from '../types/llm/request'
import { withoutCensusReports } from '../utils/chat/displayOnly'

import { extractUserRequest, requestMessageText } from './taskPinning'

export function splitAgentHistory(
  input: readonly RequestMessage[],
  request: string,
  carriedReads: readonly RequestMessage[] = [],
): { history: RequestMessage[]; priorHistory: RequestMessage[] } {
  const history = withoutCensusReports([...input]).filter(
    (message) => message.role === 'user' || message.role === 'assistant',
  )
  // Compiled turns identify their request with the context marker. A bare
  // suffix match can instead discard a previous user message (e.g. "표 2"
  // when the new request is "2").
  const last = history.at(-1)
  const text = last?.role === 'user' ? requestMessageText(last).trim() : ''
  const normalized = request.trim()
  const includesCurrent =
    last?.role === 'user' &&
    normalized.length > 0 &&
    extractUserRequest(text) === normalized
  return {
    history,
    priorHistory: [
      ...(includesCurrent ? history.slice(0, -1) : history),
      ...carriedReads,
    ],
  }
}

/**
 * True when an open note has nothing but frontmatter and whitespace, e.g. a
 * fresh daily note. Such a note is not a focus target for the first turn
 * (2026-10-18: an empty journal was read and the vault never searched).
 */
export async function isBlankNote(file: TFile | null): Promise<boolean> {
  if (!file?.vault || file.extension !== 'md') return false
  const text = await file.vault.cachedRead(file)
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim() === ''
}

export function explicitlyRetargetsCurrentFile(text: string): boolean {
  if (
    /\b(?:(?:currently )?open|active|current|this)\s+(?:note|document|file)\b|\b(?:note|document|file)\s+(?:that is |I have )?(?:currently )?open\b/i.test(
      text,
    )
  )
    return true
  if (!/\p{Script=Hangul}/u.test(text)) return false
  return /(?:현재|지금|이)\s*(?:노트|문서|파일)|(?:current|this)\s+(?:note|document|file)/i.test(
    text,
  )
}

const BINARY_DOCUMENT_EXTENSIONS = new Set([
  'hwpx',
  'hwp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
])

export function isBinaryDocumentFile(file: TFile | null | undefined): boolean {
  const extension = file?.extension?.toLowerCase()
  return extension !== undefined && BINARY_DOCUMENT_EXTENSIONS.has(extension)
}

export function isBinaryDocumentPath(path: string): boolean {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return extension !== undefined && BINARY_DOCUMENT_EXTENSIONS.has(extension)
}

export function withoutWorkflowGuide(
  guidance: string | null | undefined,
): string {
  if (!guidance) return ''
  return guidance
    .split('# Selected Verbex Workflow Guides')[0]
    .replace(/\n\n---\s*$/, '')
    .trim()
}
