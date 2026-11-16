import { L } from '../../i18n/modelText'
import type { RequestMessage } from '../../types/llm/request'

export function mapMessages(
  task: string,
  chunk: string,
  index: number,
  total: number,
  documentLabel?: string,
  mode: 'analysis' | 'evidence' = 'analysis',
  startLine?: number,
  endLine?: number,
): RequestMessage[] {
  const source = documentLabel
    ? L({ ko: ` (출처: ${documentLabel})`, en: ` (source: ${documentLabel})` })
    : ''
  return [
    {
      role: 'system',
      content:
        L({
          ko: '당신은 컨텍스트 윈도보다 큰 문서를 부분으로 나누어 처리하고 있습니다. ',
          en: 'You are processing a document larger than the context window in parts. ',
        }) +
        L({
          ko: `지금은 전체 ${total}개 조각 중 ${index}/${total} 번째 조각만 보고 있습니다${source}. `,
          en: `You are viewing only chunk ${index}/${total} out of ${total} chunks${source}. `,
        }) +
        L({
          ko: '아래 사용자 작업을 이 조각에 대해서만 수행하고, 다른 조각에서 다룰 내용은 추측하지 마세요. ',
          en: 'Perform the user task below on this chunk only; do not speculate about content covered by other chunks. ',
        }) +
        L({
          ko: '이후 병합 단계에서 활용할 수 있도록 핵심 사실·인용·항목과 그 위치(조항/섹션)를 보존해 정확하게 정리하세요. ',
          en: 'Organize the content accurately, preserving key facts, quotations, items, and their locations (articles/sections) for the later merge step. ',
        }) +
        (mode === 'evidence'
          ? L({
              ko: '현재 워크플로 단계를 선택·실행하지 말고, 다음 단계 질문이나 승인 해석 없이 이 조각의 근거 레코드만 추출하세요. ',
              en: 'Extract only evidence records from this chunk without selecting or executing a workflow step, asking about the next step, or interpreting approval. ',
            })
          : '') +
        L({
          ko: '문서의 원래 언어로 답하세요.',
          en: 'Answer in the original language of the document.',
        }),
    },
    {
      role: 'user',
      content: L({
        ko: `# 사용자 작업\n${task}\n\n# 문서 조각 ${index}/${total}${startLine && endLine ? ` (원문 L${startLine}-L${endLine})` : ''}\n${chunk}`,
        en: `# User task\n${task}\n\n# Document chunk ${index}/${total}${startLine && endLine ? ` (source L${startLine}-L${endLine})` : ''}\n${chunk}`,
      }),
    },
  ]
}

export function reduceMessages(
  task: string,
  partials: string[],
  round: number,
  documentLabel?: string,
  mode: 'analysis' | 'evidence' = 'analysis',
): RequestMessage[] {
  const source = documentLabel
    ? L({ ko: ` (출처: ${documentLabel})`, en: ` (source: ${documentLabel})` })
    : ''
  const joined = partials
    .map((partial, i) =>
      L({
        ko: `## 부분 결과 ${i + 1}\n${partial}`,
        en: `## Partial result ${i + 1}\n${partial}`,
      }),
    )
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        L({
          ko: '당신은 큰 문서를 조각별로 처리한 부분 결과들을 하나로 병합하고 있습니다',
          en: 'You are merging the partial results of processing a large document chunk by chunk into one result',
        }) +
        `${source}. ` +
        (mode === 'evidence'
          ? L({
              ko: '아래 근거 레코드들을 중복 제거해 하나의 근거 목록으로 병합하세요. 단계 선택, 승인 해석, 다음 단계 질문, 최종 보고서 작성은 금지합니다. ',
              en: 'Deduplicate the evidence records below and merge them into one evidence list. Do not select steps, interpret approval, ask about the next step, or write the final report. ',
            })
          : L({
              ko: '아래 부분 결과들을 사용자 작업에 맞춰 일관된 하나의 결과로 통합하세요. ',
              en: 'Integrate the partial results below into one coherent result for the user task. ',
            })) +
        L({
          ko: '중복은 합치고, 조각 간 모순이나 일관성 문제는 명시하며, 누락 없이 종합하세요. ',
          en: 'Merge duplicates, explicitly identify contradictions or consistency issues between chunks, and synthesize without omissions. ',
        }) +
        (round > 1
          ? L({
              ko: '이 입력 자체도 이전 병합의 중간 결과이므로 계속 통합하면 됩니다. ',
              en: 'This input is itself an intermediate result of an earlier merge; continue integrating it. ',
            })
          : '') +
        L({
          ko: '문서의 원래 언어로 답하세요.',
          en: 'Answer in the original language of the document.',
        }),
    },
    {
      role: 'user',
      content: L({
        ko: `# 사용자 작업\n${task}\n\n# 통합할 부분 결과들\n${joined}`,
        en: `# User task\n${task}\n\n# Partial results to integrate\n${joined}`,
      }),
    },
  ]
}
