import { App, TFile, normalizePath } from 'obsidian'

import { L } from '../i18n/modelText'
import type { TurnRecord } from '../runstate/turnLedger'
import {
  buildVaultFileMentionIndex,
  scanTextForVaultFileMentions,
} from '../utils/chat/fileMentions'

import { QUOTED_SPAN_RE } from './quotedSpans'
import { preparedSampleMatches } from './referencedSample'
import { extractUserRequest, requestMessageText } from './taskPinning'

type ConversationMessage = Parameters<typeof requestMessageText>[0] & {
  role: string
}

const MAX_REFERENCED_DOCUMENTS = 5

/**
 * Vault documents the user named in this turn's text without attaching them:
 * a file name with its extension anywhere in the text, or a quoted vault path
 * or note title ("‘우리부 AI 도입 방안(장차관님 보고)’ 문서 기준"). A quoted
 * title resolves only when exactly one file has that name, or when exactly one
 * of the same-named files is a Markdown note (an exported .hwpx next to its
 * source note does not make the note ambiguous). Names only; no file body is
 * read here. The caller treats the result like explicit mentions so the model
 * reads the document instead of asking the user where it is.
 */
export function resolveReferencedDocuments(
  request: string,
  files: readonly TFile[],
  extensionMentionPaths: readonly string[] = [],
): TFile[] {
  const byPath = new Map<string, TFile>()
  const byName = new Map<string, TFile[]>()
  for (const file of files) {
    byPath.set(file.path, file)
    for (const name of new Set([file.name, file.basename])) {
      byName.set(name, [...(byName.get(name) ?? []), file])
    }
  }

  const found = new Map<string, TFile>()
  const add = (file: TFile | null | undefined) => {
    if (file && found.size < MAX_REFERENCED_DOCUMENTS)
      found.set(file.path, file)
  }
  for (const path of extensionMentionPaths) add(byPath.get(path))

  for (const match of request.matchAll(QUOTED_SPAN_RE)) {
    const quoted = match.slice(1).find((group) => group !== undefined)
    const candidate = normalizeCandidate(quoted ?? '')
    if (!candidate) continue
    const exact = byPath.get(candidate) ?? byPath.get(`${candidate}.md`)
    if (exact || candidate.includes('/')) {
      add(exact)
      continue
    }
    add(singleNamed(byName.get(candidate) ?? []))
  }
  return [...found.values()]
}

/** App wrapper: the vault file list plus extension-bearing name mentions. */
export function resolveReferencedVaultDocuments(
  app: App,
  request: string,
): TFile[] {
  if (!request.trim()) return []
  const vault = app.vault as Partial<
    Pick<App['vault'], 'getFiles' | 'getMarkdownFiles'>
  >
  const files = vault.getFiles?.() ?? vault.getMarkdownFiles?.() ?? []
  if (files.length === 0) return []
  const mentions = scanTextForVaultFileMentions(
    request,
    buildVaultFileMentionIndex(files),
  ).map((mention) => mention.path)
  return resolveReferencedDocuments(request, files, mentions)
}

/**
 * Paths of documents named in this request or any earlier user request of the
 * conversation, newest first. Only the user's own words are scanned (context
 * the controller added to earlier turns is stripped), so search results and
 * tool output never add entries.
 */
export function referencedConversationPaths(
  app: App,
  request: string,
  prior: readonly ConversationMessage[],
): string[] {
  const requests = prior
    .filter((message) => message.role === 'user')
    .map((message) => extractUserRequest(requestMessageText(message)))
    .reverse()
  return resolveReferencedVaultDocuments(
    app,
    [request, ...requests].join('\n'),
  ).map((file) => file.path)
}

export function referencedDocumentsFor(plan: {
  referencedPaths?: readonly string[]
  currentTurn?: TurnRecord
}): string | null {
  return formatReferencedDocuments(
    plan.referencedPaths ?? [],
    plan.currentTurn?.documentJobPreparation,
  )
}

/**
 * Prompt section naming the vault paths of documents the user referred to by
 * name anywhere in the conversation, so later turns reuse the exact path (a
 * root-level file stays root-level) instead of guessing a folder or asking.
 */
export function formatReferencedDocuments(
  paths: readonly string[],
  preparedSample?: {
    trigger?: string
    samplePath: string
    result: Record<string, unknown>
  },
): string | null {
  if (paths.length === 0) return null
  return [
    L({
      ko: '사용자가 이 대화에서 이름이나 경로로 가리킨 Vault 문서입니다. 도구에는 아래 경로를 그대로 넣고, 폴더를 덧붙이거나 사용자에게 경로를 다시 묻지 않습니다.',
      en: `Vault documents the user referred to by name or path in this conversation. Pass the paths below unchanged to tools; do not add folders or ask the user for the paths again.`,
    }),
    ...paths.map((path) =>
      L({
        ko: `- \`${path}\`${path.includes('/') ? '' : ' (Vault 최상위)'}${preparedSampleMatches(path, preparedSample) ? ' (이번 서식 작업의 샘플: 서식·문체 근거는 document_jobs의 draft_contract(reference_excerpt·reference_text_path)에 있습니다. 이 파일을 직접 읽거나 고치지 않습니다.)' : ''}`,
        en: `- \`${path}\`${path.includes('/') ? '' : ' (Vault root)'}${preparedSampleMatches(path, preparedSample) ? ' (sample for this format job: format/style evidence is in document_jobs draft_contract(reference_excerpt/reference_text_path). Do not read or edit this file directly.)' : ''}`,
      }),
    ),
  ].join('\n')
}

function normalizeCandidate(raw: string): string {
  const trimmed = raw.trim().replace(/^\/+/, '')
  return trimmed ? normalizePath(trimmed) : ''
}

function singleNamed(files: readonly TFile[]): TFile | null {
  if (files.length === 1) return files[0]
  const notes = files.filter((file) => file.extension === 'md')
  return notes.length === 1 ? notes[0] : null
}
