import type { TFile } from 'obsidian'

import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import {
  formatCandidateReferences,
  formatExplicitContextBodies,
} from '../prompt/contextVariables'
import type { VerbexContextTrace } from '../verbex/types'

import { formatAgentCatalogContext } from './agentCatalogContext'
import { formatContextBodies } from './agentContextBodies'
import { automaticCollectionGuidance } from './automaticCollectionGuidance'
import { type FitMode, fitAgentContext } from './baseContextFit'

/** Context presentation owns no controller or UI state. Retrieval is the only port. */
export class AgentContextPresenter {
  constructor(
    private readonly retrieve: (
      query: string,
      currentFile: TFile | null | undefined,
      budget: number,
    ) => Promise<VerbexContextTrace>,
  ) {}

  formatAgentContext(
    request: string,
    context: VerbexContextTrace,
    exposedToolNames?: ReadonlySet<string>,
  ): string {
    const { sections, excluded } = formatContextBodies(context, request)

    if (sections.length === 0 && !excluded) {
      return ''
    }

    const guidance = [
      L({ ko: '## 컨텍스트 관리 지침', en: `## Context management guidance` }),
      automaticCollectionGuidance(context, exposedToolNames),
      L({
        ko: '- 아래 본문 포함 항목은 이미 컨텍스트에 있으므로 중복해서 읽지 마세요.',
        en: `- Items with bodies below are already in context; do not read them again.`,
      }),
      ...(context.items.some((item) => item.truncatedForFit)
        ? [
            L({
              ko: '- 앞부분만 실린 항목은 필요한 나머지 부분을 경로로 읽으세요.',
              en: `- For items with only a leading excerpt, read the remaining parts by path if needed.`,
            }),
          ]
        : []),
      L({
        ko: '- 본문이 없거나 더 정밀한 근거가 필요한 후보는 search_vault로 점수·크기·라인 수를 확인한 뒤 note_outline -> read_note_section/read_note_lines/read_note_around 순서로 필요한 조각만 읽으세요.',
        en: `- For candidates without bodies or requiring more precise evidence, inspect scores, size and line counts with search_vault, then read only the necessary portions using note_outline -> read_note_section/read_note_lines/read_note_around.`,
      }),
      L({
        ko: '- 작업과 무관한 후보, 낮은 점수의 후보, 약한 구조 연결(공유 태그·먼 링크 등)은 컨텍스트에 추가하지 말고 무시하세요.',
        en: `- Ignore candidates unrelated to the task, low-scoring candidates, and weak structural links (shared tags or distant links); do not add them to context.`,
      }),
      L({
        ko: '- 답변에 근거를 인용할 때 제공된 출처 링크가 있으면 링크 전체를 그대로 사용하세요. 표시된 줄 범위는 검색된 부분의 범위이며, 제공되지 않은 위치를 만들어 내지 마세요.',
        en: `- When citing evidence, use the entire supplied source link unchanged. Displayed line ranges cover the retrieved portion; do not invent locations that were not provided.`,
      }),
    ]
      .filter(Boolean)
      .join('\n')

    const blocks = [
      L({
        ko: `${modelMarker('context', 'ko')} 각 항목에는 출처와 관련도 신호가 달려 있으니, 요청과 실제로 관련된 것만 골라 근거로 쓰고 약하게 연결된 자료(공유 태그·먼 링크 등)는 무관하면 무시하세요:\n\n${guidance}\n\n${sections.join('\n\n')}`,
        en: `${modelMarker('context', 'en')} Each item has source and relevance signals. Use only material actually relevant to the request as evidence; ignore weak connections (shared tags or distant links) when unrelated:\n\n${guidance}\n\n${sections.join('\n\n')}`,
      }),
    ]
    if (excluded) {
      blocks.push(
        L({
          ko: `## 제외된 자료 (참고)\n아래 노트는 검색에 잡혔으나 토큰 예산 또는 낮은 관련도로 본문이 컨텍스트에 포함되지 않았습니다. 작업에 실제로 필요하다고 판단되면 search_vault 또는 note_outline로 크기와 구조를 확인한 뒤 필요한 조각만 읽으세요. 그렇지 않으면 무시해도 됩니다.\n\n${excluded}`,
          en: `## Excluded material (reference)\nThese notes were retrieved but their bodies were excluded due to the token budget or low relevance. If actually needed, check size and structure with search_vault or note_outline, then read only the necessary portions. Otherwise ignore them.\n\n${excluded}`,
        }),
      )
    }
    return blocks.filter((block) => block.trim()).join('\n\n')
  }

  formatAgentCatalogContext(
    request: string,
    context: VerbexContextTrace,
    catalogTokenBudget: number,
    catalogCandidateLimit: number,
  ): string {
    return formatAgentCatalogContext(
      request,
      context,
      catalogTokenBudget,
      catalogCandidateLimit,
    )
  }

  formatAgentExplicitContext(context: VerbexContextTrace): string {
    const { mentioned } = formatExplicitContextBodies(context)
    return mentioned ? `## Explicitly attached files\n${mentioned}` : ''
  }

  fitAgentContext(
    request: string,
    context: VerbexContextTrace,
    mode: FitMode,
    options: {
      targetTokens: number
      catalogTokenBudget: number
      catalogCandidateLimit: number
      exposedToolNames?: ReadonlySet<string>
    },
  ) {
    return fitAgentContext({
      trace: context,
      mode,
      targetTokens: options.targetTokens,
      catalogCandidateLimit: options.catalogCandidateLimit,
      render: (trace, { catalogCandidateLimit }) =>
        mode === 'full'
          ? this.formatAgentContext(request, trace, options.exposedToolNames)
          : mode === 'catalog'
            ? this.formatAgentCatalogContext(
                request,
                trace,
                options.catalogTokenBudget,
                catalogCandidateLimit,
              )
            : this.formatAgentExplicitContext(trace),
    })
  }

  /**
   * Body-less candidate list re-grounding a substantive follow-up turn (A-3).
   * Runs one retrieval for the new query and renders only paths + source +
   * relevance — never bodies — so the model is pointed at what to read without
   * the multi-turn bloat of re-injecting the full context pack. Defensive: any
   * retrieval failure yields no grounding rather than failing the turn.
   */
  async buildFollowUpGrounding(
    query: string,
    currentFile: TFile | null | undefined,
    budget: number,
  ): Promise<string> {
    try {
      const trace = await this.retrieve(query, currentFile, budget)
      const candidates = formatCandidateReferences(trace)
      if (!candidates) {
        return ''
      }
      return [
        L({
          ko: '## 추가 자료 후보 (이번 질문 기준, 본문 미포함)',
          en: `## Additional material candidates (for this question, bodies excluded)`,
        }),
        L({
          ko: '아래는 이번 질문과 관련해 Vault에서 검색된 노트 후보입니다(경로·출처·관련도만 표시). 답변에 필요하면 read_file 또는 부분 읽기 도구로 직접 확인하고, 무관하면 무시하세요. 이미 이전 대화에 본문이 있는 노트는 다시 읽지 마세요.',
          en: `These note candidates were retrieved from the Vault for this question (paths, sources and relevance only). If needed for the answer, inspect them with read_file or partial reading tools; otherwise ignore them. Do not reread notes whose bodies are already in earlier conversation.`,
        }),
        candidates,
      ].join('\n')
    } catch {
      return ''
    }
  }

  /**
   * Re-attach the bodies of the active workflow's source material on a
   * continuation turn. A multi-stage workflow (e.g. map → detailed_review)
   * advances on a bare "진행", which strips the first-turn context pack from the
   * stored history; a weak local model will not re-read the source on its own
   * (it can answer with no tool call at all), so the detailed stage would
   * otherwise work from its own thin summary. Retrieve against the run's last
   * substantive request — not the contentless continuation — and re-inject the
   * matching bodies within budget. Defensive: any retrieval failure yields no
   * grounding rather than failing the turn.
   */
  async buildWorkflowRegrounding(
    query: string,
    currentFile: TFile | null | undefined,
    budget: number,
  ): Promise<string> {
    try {
      const trace = await this.retrieve(query, currentFile, budget)
      const { sections, excluded } = formatContextBodies(trace, query)
      if (sections.length === 0) {
        return ''
      }
      const blocks = [
        [
          L({
            ko: '## 진행 중인 작업의 자료 (재첨부)',
            en: `## Material for the ongoing task (reattached)`,
          }),
          L({
            ko: '아래는 이 워크플로의 앞 단계에서 모은 Vault 자료를 다음 단계를 위해 다시 첨부한 것입니다. 이미 대화에 본문이 있으면 다시 읽지 말고, 이 본문을 근거로 작업을 이어가세요. 요청과 무관한 항목은 무시하세요.',
            en: `Vault material gathered in earlier workflow steps is reattached for the next step. If its body is already in the conversation, do not reread it; continue using that body as evidence. Ignore items unrelated to the request.`,
          }),
          sections.join('\n\n'),
        ].join('\n\n'),
      ]
      if (excluded) {
        blocks.push(
          L({
            ko: `## 제외된 자료 (참고)\n토큰 예산 또는 낮은 관련도로 본문이 빠진 후보입니다. 작업에 실제로 필요하면 note_outline로 구조를 확인한 뒤 필요한 조각만 읽으세요. 그렇지 않으면 무시해도 됩니다.\n\n${excluded}`,
            en: `## Excluded material (reference)\nCandidate bodies were excluded due to the token budget or low relevance. If actually needed, inspect structure with note_outline and read only necessary portions. Otherwise ignore them.\n\n${excluded}`,
          }),
        )
      }
      return blocks.join('\n\n')
    } catch {
      return ''
    }
  }
}
