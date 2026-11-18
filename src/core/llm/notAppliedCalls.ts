import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import type { ToolCallRequest } from '../../types/tool-call.types'

import {
  APPLIED_MUTATION_STATUSES,
  type MutationLogEntry,
  mutationCallTarget,
} from './mutationFailureFacts'
import type { AgentToolOutcome } from './toolOutcome'

export type NotAppliedCall = {
  tool: string
  target?: string
  at: number
}

export function unresolvedNotAppliedCalls(
  calls: readonly NotAppliedCall[],
  mutationLog: readonly MutationLogEntry[],
): NotAppliedCall[] {
  return calls.filter(
    (call) =>
      !mutationLog
        .slice(call.at)
        .some(
          (item) =>
            item.tool === call.tool &&
            item.target === call.target &&
            APPLIED_MUTATION_STATUSES.has(item.status),
        ),
  )
}

export function notAppliedCallFacts(
  unresolved: readonly NotAppliedCall[],
): string {
  if (!unresolved.length) return ''
  const groups = new Map<string, { label: string; count: number }>()
  for (const call of unresolved) {
    const id = `${call.tool}\n${call.target ?? ''}`
    const group = groups.get(id)
    groups.set(id, {
      label: `\`${call.tool}\`${call.target ? ` (${call.target})` : ''}`,
      count: (group?.count ?? 0) + 1,
    })
  }
  const lines = [...groups.values()].map((group) =>
    L({
      ko: `- ${group.label}: ${group.count}건`,
      en: `- ${group.label}: ${group.count} calls`,
    }),
  )
  return [
    L({
      ko: `${modelMarker('harnessFact', 'ko')} 이 턴에서 실행되지 않았거나 적용 전 확인 단계에서 끝난 변경 호출 ${unresolved.length}건(도구 결과 기준):`,
      en: `${modelMarker('harnessFact', 'en')} ${unresolved.length} change calls in this turn were not executed or ended at the pre-apply check step (based on tool results):`,
    }),
    ...lines,
    L({
      ko: '이 호출들로 바뀐 파일은 없습니다.',
      en: 'These calls changed no file.',
    }),
  ].join('\n')
}

export function createNotAppliedTracker() {
  const calls: NotAppliedCall[] = []
  return {
    record(
      call: ToolCallRequest,
      outcome: Pick<AgentToolOutcome, 'notApplied'>,
      mutationLogLength: number,
    ): void {
      if (!outcome.notApplied) return
      calls.push({
        tool: call.name,
        target: mutationCallTarget(call),
        at: mutationLogLength,
      })
    },
    appendFacts(
      text: string,
      mutationLog: readonly MutationLogEntry[],
    ): string {
      const facts = notAppliedCallFacts(
        unresolvedNotAppliedCalls(calls, mutationLog),
      )
      if (!facts) return text
      return [text.trimEnd(), facts].filter(Boolean).join('\n\n')
    },
  }
}
