import { L } from '../../i18n/modelText'
import { tokenCount } from '../../utils/llm/token'
import { chatMessageBudget } from '../llm/budgetGate'
import { mapReduceDocument } from '../llm/documentMapReduce'
import { AgentToolOutcome } from '../llm/toolOutcome'

import { ReadPageRecoveryLedger } from './readPageRecovery'
import {
  DigestInput,
  DigestUsage,
  createReadPageStep,
  digestSizeHint,
} from './readPageStep'

/** Summarize unsent read pages in isolated calls; never spill failed digests back as raw pages. */
export function createReadPageDigester(options: {
  enabled: boolean
  request: string
  input: DigestInput
  usage: DigestUsage
}) {
  const recovery = new ReadPageRecoveryLedger()
  return async (outcomes: AgentToolOutcome[]): Promise<AgentToolOutcome[]> => {
    // A later digest failure must not hide an already-applied mutation receipt.
    if (
      !options.enabled ||
      outcomes.some((outcome) => outcome.mutation !== 'none')
    )
      return outcomes
    const results: AgentToolOutcome[] = []
    const inputBudget = options.input.inputBudget ?? 8000
    const pageBudget = Math.max(
      512,
      Math.min(2000, Math.floor(inputBudget * 0.08)),
    )
    // Each page keeps at most this much, so several pages fit in one turn.
    const retainedTokens = Math.max(
      384,
      Math.min(1536, Math.floor(inputBudget * 0.05)),
    )
    for (const outcome of outcomes) {
      const page = outcome.readPage
      if (
        outcome.privateTranscript ||
        !page ||
        outcome.status !== 'succeeded' ||
        (await tokenCount(page.text)) <= pageBudget
      ) {
        results.push(outcome)
        continue
      }
      const signal = options.input.options?.signal
      signal?.throwIfAborted()
      if (recovery.exhausted(outcome)) {
        results.push(recovery.failure(outcome, false))
        continue
      }
      try {
        const digest = await mapReduceDocument({
          document: page.text,
          task: L({
            ko: `${options.request}\n현재 읽은 구간만 ${digestSizeHint(retainedTokens)}의 핵심 bullet로 간결하게 요약하세요. 주요 논점·수치·한계를 보존하고 서론·결론·추가 안내는 생략하세요. 문서 전체를 읽었다고 주장하지 마세요.`,
            en: `${options.request}\nSummarize only the currently read range concisely in key bullets of ${digestSizeHint(retainedTokens)}. Preserve key points, figures, and limitations; omit introductions, conclusions, and additional guidance. Do not claim to have read the entire document.`,
          }),
          documentLabel: outcome.evidence?.paths.join(', '),
          inputTokenBudget: Math.max(
            1,
            chatMessageBudget(inputBudget, 0) - 1024,
          ),
          signal,
          runStep: createReadPageStep(
            options.input,
            outcome,
            options.usage,
            retainedTokens,
          ),
        })
        // Mechanical status/size checks only, never model prose judgments.
        if (
          digest.evidenceRecords.some(
            (record) => record.processingStatus !== 'done',
          )
        )
          throw new Error('read_page_digest_incomplete')
        recovery.succeeded(outcome)
        results.push({
          ...outcome,
          readPage: undefined,
          displayText: L({
            ko: `[읽은 구간 요약 · ${digest.chunkCount}개 조각 · 문서 전체 완료 여부는 아래 원본 메타데이터 참조]\n출처: ${outcome.evidence?.paths.join(', ') ?? ''}\n${digest.finalText}\n${page.continuation}`,
            en: `[Read range digest · ${digest.chunkCount} chunks · see original metadata below for whole-document completion]\nSource: ${outcome.evidence?.paths.join(', ') ?? ''}\n${digest.finalText}\n${page.continuation}`,
          }),
        })
      } catch (error) {
        signal?.throwIfAborted()
        console.warn(
          '[Verbex][read-page-digest]',
          JSON.stringify({
            status: 'failed',
            errorName: error instanceof Error ? error.name : 'Error',
          }),
        )
        results.push(recovery.failure(outcome))
      }
    }
    return results
  }
}
