import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'
import type { ToolCallRequest } from '../types/tool-call.types'
import { sha256Hex } from '../utils/hash'

import { canonicalReadArgs } from './canonicalRead'

export type RepeatedToolSummary = {
  name: string
  count: number
  mutation: 'none' | 'applied' | 'unknown'
}

export function mutationFact(summary: RepeatedToolSummary): string {
  if (summary.mutation === 'unknown')
    return L({
      ko: '변경 적용 여부를 확인하지 못한 결과가 있습니다.',
      en: `Some results did not confirm whether changes were applied.`,
    })
  if (summary.mutation === 'applied')
    return L({
      ko: '이 턴에서 변경이 적용된 결과가 있습니다.',
      en: `Some results confirm changes applied in this turn.`,
    })
  return L({
    ko: '이 턴에서 변경이 적용된 결과는 없습니다.',
    en: `No results confirm changes applied in this turn.`,
  })
}

export function appliedMutationFact(
  paths: Set<string>,
  unknown: boolean,
  pathMissing: boolean,
): string {
  const listed = [...paths]
  const fact = listed.length
    ? L({
        ko: `이 턴에서 적용된 변경: ${listed.slice(0, 5).join(', ')}${listed.length > 5 ? ` 외 ${listed.length - 5}개` : ''}.`,
        en: `Changes applied in this turn: ${listed.slice(0, 5).join(', ')}${listed.length > 5 ? ` and ${listed.length - 5} more` : ''}.`,
      })
    : pathMissing
      ? L({
          ko: '이 턴에서 변경이 적용되었으나 경로를 확인하지 못했습니다.',
          en: `Changes were applied in this turn, but their paths could not be confirmed.`,
        })
      : unknown
        ? L({
            ko: '이 턴에서 변경 적용 여부를 확인하지 못한 결과가 있습니다.',
            en: `Some results in this turn did not confirm whether changes were applied.`,
          })
        : L({
            ko: '이 턴에서 적용된 변경은 없습니다.',
            en: `No changes were applied in this turn.`,
          })
  return (
    fact +
    (listed.length && pathMissing
      ? L({
          ko: ' 경로를 확인하지 못한 적용 결과도 있습니다.',
          en: ` Some applied results also have unconfirmed paths.`,
        })
      : '') +
    (listed.length && unknown
      ? L({
          ko: ' 변경 적용 여부를 확인하지 못한 결과도 있습니다.',
          en: ` Some results also have unconfirmed application status.`,
        })
      : '')
  )
}

export class RepeatedToolCalls {
  private mutation: RepeatedToolSummary['mutation'] = 'none'
  private readonly calls = new Map<
    string,
    { name: string; count: number; hash: string }
  >()

  async observe(
    call: ToolCallRequest,
    outcome: AgentToolOutcome,
  ): Promise<AgentToolOutcome> {
    if (outcome.mutation === 'unknown') this.mutation = 'unknown'
    else if (
      (outcome.mutation === 'applied' || outcome.mutation === 'partial') &&
      this.mutation !== 'unknown'
    )
      this.mutation = 'applied'
    const key = JSON.stringify([call.name, canonicalReadArgs(call.arguments)])
    const hash = await sha256Hex(outcome.displayText)
    const previous = this.calls.get(key)
    const count = (previous?.count ?? 0) + 1
    this.calls.set(key, { name: call.name, count, hash })
    if (!previous || previous.hash !== hash || outcome.mutation !== 'none')
      return outcome
    return {
      ...outcome,
      repeatOriginalText: outcome.displayText,
      displayText: L({
        ko: `${outcome.displayText}\n${modelMarker('harnessFact', 'ko')} 이 턴에서 같은 인자로 같은 도구를 ${count}번째 호출했고 결과는 직전과 같습니다. 인자·범위를 바꾸거나 다음 단계로 진행하세요.`,
        en: `${outcome.displayText}\n${modelMarker('harnessFact', 'en')} This is call ${count} to the same tool with the same arguments in this turn, and its result is unchanged. Change arguments/scope or proceed to the next step.`,
      }),
    }
  }

  mostRepeated(): RepeatedToolSummary | undefined {
    let best: RepeatedToolSummary | undefined
    for (const item of this.calls.values())
      if (item.count >= 3 && (!best || item.count > best.count))
        best = { name: item.name, count: item.count, mutation: this.mutation }
    return best
  }
}
