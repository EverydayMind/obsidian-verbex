import { validDocumentJobs } from '../../core/document-jobs/validJobs'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import { L } from '../../i18n/modelText'
import { KORDOC_PROVIDER_ID } from '../contract'
import type { ProviderRegistrySnapshot } from '../providerTurnTypes'

import { documentJobHost } from './documentJobHost'
import { sameVaultFile } from './documentJobPathMatch'
import type { NativeProviderHost } from './NativeProviderHost'

export async function appendDocumentJobSampleExemplar(
  host: NativeProviderHost | undefined,
  name: string,
  args: Record<string, unknown>,
  snapshot: ProviderRegistrySnapshot,
  outcome: AgentToolOutcome,
  signal?: AbortSignal,
): Promise<AgentToolOutcome> {
  signal?.throwIfAborted()
  if (
    !host ||
    name !== `plg__${KORDOC_PROVIDER_ID}__read_document` ||
    outcome.status !== 'succeeded' ||
    (snapshot.documentJobTrigger !== 'explicit' &&
      !snapshot.documentJobExplicitJobIds?.length) ||
    !snapshot.caller?.conversationId ||
    typeof args.path !== 'string'
  )
    return outcome
  try {
    const service = documentJobHost(host)
    let aborted: Error | undefined
    const jobs = await validDocumentJobs({
      store: service.store,
      conversationId: snapshot.caller.conversationId,
      hash: async (path) => {
        try {
          return await service.byteHash(path)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError')
            aborted = error
          throw error
        }
      },
      signal,
    })
    if (aborted) throw aborted
    const matches = []
    for (const job of jobs) {
      if (
        job.status.state !== 'ready' ||
        (snapshot.documentJobTrigger !== 'explicit' &&
          !snapshot.documentJobExplicitJobIds?.includes(job.id))
      )
        continue
      const same = await sameVaultFile(
        host.hostContext().app,
        args.path,
        job.samplePath,
      )
      signal?.throwIfAborted()
      if (same === undefined) return outcome
      if (same) matches.push(job)
    }
    const first = matches[0]
    if (!first || first.status.state !== 'ready') return outcome
    const excerpt = first.status.data.draftContract.reference_excerpt
    if (
      typeof excerpt !== 'string' ||
      matches.some(
        (job) =>
          job.status.state !== 'ready' ||
          job.status.data.draftContract.reference_excerpt !== excerpt,
      )
    )
      return outcome
    return {
      ...outcome,
      displayText: L({
        ko: `${outcome.displayText}\n[서식 작업 본보기] \`${first.samplePath}\`은 이번 서식 작업의 샘플입니다. 샘플의 사실·수치·고유 문구는 새 문서의 근거가 아닙니다. 위 글은 샘플 원문이라 □·ㅇ·※·* 같은 기호 글자가 보입니다. 새 문서 초안은 이 글자를 쓰지 않고, 아래 v2 본보기처럼 제목 단계와 역할 지시로 씁니다(기호는 템플릿이 roles의 앞 글자로 붙입니다). 본보기 전체는 draft_contract.reference_text_path에 있습니다.\n--- v2 본보기(작업 계약 reference_excerpt) ---\n${excerpt}`,
        en: `${outcome.displayText}\n[Format-job exemplar] \`${first.samplePath}\` is the sample for this format job. Its facts, numbers and distinctive wording are not evidence for the new document. The text above is sample source text, so symbols such as □, ㅇ, ※ and * appear. Do not write these characters in the new draft; use heading levels and role directives as in the v2 exemplar below (the template adds symbols from roles prefixes). The full exemplar is at draft_contract.reference_text_path.\n--- v2 exemplar (job contract reference_excerpt) ---\n${excerpt}`,
      }),
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof Error && error.name === 'AbortError') throw error
    return outcome
  }
}
