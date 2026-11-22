import type { App } from 'obsidian'

import { draftStructure } from '../../core/document-jobs/decompose/draftStructure'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { AfterApplyResult } from '../../core/tools/localChangePreparation'
import { L } from '../../i18n/modelText'

import { documentJobFileBytes } from './documentJobFileHash'
import { documentJobGlyphFacts } from './documentJobGlyphFacts'
import { renamedDraftArguments } from './documentJobRenamedDraft'
import type { HostContext } from './editorActions'

export async function otherDraftFact(
  app: App,
  store: DocumentJobStore,
  jobs: FormatJob[],
  path: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const candidates: FormatJob[] = []
  for (const job of jobs) {
    signal?.throwIfAborted()
    if (job.status.state !== 'ready' || store.hasProduction(job.id)) continue
    try {
      if ((await app.vault.adapter.stat(job.status.data.draftPath)) === null)
        candidates.push(job)
    } catch {
      signal?.throwIfAborted()
    }
  }
  signal?.throwIfAborted()
  if (candidates.length !== 1) return
  const job = candidates[0]
  const next = renamedDraftArguments(job, path)
  return L({
    ko: `[서식 작업] 방금 쓴 \`${path}\`는 서식 작업 ${job.id}의 초안 경로가 아닙니다. 이 문서가 그 작업의 초안이라면 다시 쓰지 말고 produce_format_reuse의 draft_path에 이 경로를 넘기세요. output_path의 파일 이름도 같은 이름으로 맞춥니다: ${JSON.stringify(next)}`,
    en: `[Format job] The file just written, \`${path}\`, is not the draft path for format job ${job.id}. If this is that job's draft, do not write it again; pass this path as draft_path to produce_format_reuse. Match the output_path file name to the same name: ${JSON.stringify(next)}`,
  })
}

export async function structureFact(
  context: HostContext,
  job: FormatJob,
  path: string,
  signal?: AbortSignal,
): Promise<Exclude<AfterApplyResult, string>> {
  if (job.status.state !== 'ready')
    return { text: '', observation: { structure: 'unavailable' } }
  try {
    const text = new TextDecoder().decode(
      await documentJobFileBytes(context, path),
    )
    signal?.throwIfAborted()
    const structure = draftStructure(
      text,
      job.status.data.draftContract,
      job.status.data.rolePrefixes,
    )
    const result = structure.draft_structure as
      | {
          leadingGlyphParagraphs: {
            count: number
            examples: { line: number; text: string }[]
          }
          markdownListItems: number
          unknownRoleDirectives: { name: string; line: number }[]
        }
      | undefined
    if (!result) return { text: '', observation: { structure: 'unavailable' } }
    const lines = documentJobGlyphFacts(text, job.status.data.rolePrefixes)
    const hasIssues = !!structure.draft_structure_guidance
    if (result.markdownListItems)
      lines.push(
        L({
          ko: `Markdown 목록 ${result.markdownListItems}개. v2 초안은 목록 대신 제목 단계와 역할 지시로 씁니다.`,
          en: `${result.markdownListItems} Markdown list items. Use heading levels and role directives instead of lists in v2 drafts.`,
        }),
      )
    if (result.unknownRoleDirectives.length)
      lines.push(
        L({
          ko: `이 작업에 없는 역할 지시 ${result.unknownRoleDirectives.length}개(${result.unknownRoleDirectives.map((e) => `${e.name}·${e.line}행`).join(', ')}). roles에 있는 역할만 씁니다.`,
          en: `${result.unknownRoleDirectives.length} role directives absent from this job (${result.unknownRoleDirectives.map((e) => `${e.name}·line ${e.line}`).join(', ')}). Use only roles listed in roles.`,
        }),
      )
    const factText = lines.length
      ? [
          L({
            ko: '[초안 구조 사실] 쓰기 뒤 다시 읽은 파일 기준:',
            en: `[Draft structure facts] Based on the file read back after writing:`,
          }),
          ...lines,
          ...(hasIssues
            ? [
                L({
                  ko: '고치려면 같은 draft_path에 다시 쓴 뒤 produce_format_reuse를 호출합니다.',
                  en: `To correct it, rewrite the same draft_path, then call produce_format_reuse.`,
                }),
              ]
            : []),
        ].join('\n')
      : ''
    return {
      text: factText,
      observation: { structure: hasIssues ? 'issues' : 'clean' },
    }
  } catch {
    signal?.throwIfAborted()
    return { text: '', observation: { structure: 'unavailable' } }
  }
}
export { findDraftJob } from './findDraftJob'
