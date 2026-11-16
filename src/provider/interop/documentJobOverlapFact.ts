import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { sampleOverlap } from '../../core/document-jobs/sampleOverlap'
import type { AfterApplyResult } from '../../core/tools/localChangePreparation'
import { L } from '../../i18n/modelText'

import { documentJobFileBytes } from './documentJobFileHash'
import { structureFact } from './documentJobWriteFacts'
import type { HostContext } from './editorActions'

export async function documentJobOverlapFact(
  context: HostContext,
  job: FormatJob,
  path: string,
  signal?: AbortSignal,
): Promise<Exclude<AfterApplyResult, string>> {
  const structure = await structureFact(context, job, path, signal)
  if (job.status.state !== 'ready') return structure
  const reference = job.status.data.draftContract.reference_text_path
  if (typeof reference !== 'string' || !reference) return structure
  try {
    const decoder = new TextDecoder()
    const sample = decoder.decode(
      await documentJobFileBytes(context, reference),
    )
    signal?.throwIfAborted()
    const draft = decoder.decode(await documentJobFileBytes(context, path))
    const overlap = sampleOverlap(sample, draft, signal)
    if (!overlap?.count) return structure
    const examples = overlap.examples.length
      ? L({
          ko: `(예: ${overlap.examples.map((e) => `${e.line}행 "${e.text}"`).join(', ')})`,
          en: `(e.g. ${overlap.examples.map((e) => `line ${e.line} "${e.text}"`).join(', ')})`,
        })
      : ''
    const fact = L({
      ko: `[샘플 공통 구절 관측] 정규화한 연속 20자 이상이 샘플 원문과 같은 초안 블록 ${overlap.count}개${examples}. 이 관측은 일부 구절만 보며, 일치가 없다고 샘플 내용이 없다는 뜻은 아닙니다. 샘플 내용은 새 문서의 근거가 아닙니다.`,
      en: `[Sample phrase overlap observed] ${overlap.count} draft blocks contain at least 20 consecutive normalized characters matching the sample${examples}. This checks only some phrases; no match does not mean no sample content. Sample content is not evidence for the new document.`,
    })
    return {
      ...structure,
      text: [structure.text, fact].filter(Boolean).join('\n'),
    }
  } catch {
    signal?.throwIfAborted()
    return structure
  }
}
