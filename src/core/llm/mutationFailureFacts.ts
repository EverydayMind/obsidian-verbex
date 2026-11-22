import { modelMarker, stripPluginResultBanner } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import type { ToolCallRequest } from '../../types/tool-call.types'

import type { MutationResultStatus } from './agentLoop'
import type { AgentToolOutcome } from './toolOutcome'

export function mutationResultStatus(
  outcome: Pick<AgentToolOutcome, 'mutation' | 'status'>,
): MutationResultStatus {
  return outcome.mutation === 'partial'
    ? 'partial'
    : outcome.status === 'failed'
      ? 'failed'
      : outcome.status === 'rejected'
        ? 'rejected'
        : outcome.mutation === 'applied'
          ? 'applied'
          : 'unknown'
}

export function missingToolExecutionResult(): AgentToolOutcome {
  return {
    status: 'failed',
    terminal: true,
    mutation: 'none',
    displayText: L({
      ko: '(오류: 도구 실행 결과가 없습니다.)',
      en: `(Error: no tool execution result.)`,
    }),
  }
}

export type MutationLogEntry = {
  key: string
  tool: string
  target?: string
  status: string
}

const FAILED = new Set(['failed', 'rejected', 'partial'])
export const APPLIED_MUTATION_STATUSES = new Set(['applied', 'partial'])
const SUMMARY_LIMIT = 120

export function laterAppliedMutationCount(
  log: readonly MutationLogEntry[],
  at: number,
): number {
  const call = log[at]
  return call
    ? log
        .slice(at + 1)
        .filter(
          (item) =>
            item.tool === call.tool &&
            item.target === call.target &&
            APPLIED_MUTATION_STATUSES.has(item.status),
        ).length
    : 0
}

/** The `path` argument of a call, when it has one. */
export function mutationCallTarget(call: ToolCallRequest): string | undefined {
  try {
    const path = (JSON.parse(call.arguments ?? '{}') as { path?: unknown }).path
    return typeof path === 'string' && path.trim() ? path.trim() : undefined
  } catch {
    return undefined
  }
}

/** First sentence-level part of a tool result: no result banner, no JSON tail. */
function summary(text: string): string {
  const plain = [
    ...stripPluginResultBanner(text)
      .replace(/\s+\{"[\s\S]*$/, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
  return (
    plain.slice(0, SUMMARY_LIMIT).join('') +
    (plain.length > SUMMARY_LIMIT ? '…' : '')
  )
}

/**
 * Host-written facts appended to the answer when the model did not report a
 * failed change itself. Counts and tool results only: the answer text is kept
 * as written and is not judged or rewritten here. Failures are grouped by tool
 * and target; a later applied call of the same tool on the same target is
 * stated beside them, not treated as their resolution.
 */
export function unreportedMutationFailureFacts(
  ledger: ReadonlyMap<string, { status: string; text: string }>,
  log: readonly MutationLogEntry[],
): string {
  const groups = new Map<
    string,
    { label: string; count: number; last: number; text: string }
  >()
  for (const [key, entry] of ledger) {
    if (!FAILED.has(entry.status)) continue
    const at = log.map((item) => item.key).lastIndexOf(key)
    const call = log[at]
    const id = call ? `${call.tool}\n${call.target ?? ''}` : key
    const group = groups.get(id)
    groups.set(id, {
      label: `\`${call?.tool ?? key}\`${call?.target ? ` (${call.target})` : ''}`,
      count: (group?.count ?? 0) + 1,
      last: Math.max(group?.last ?? -1, at),
      text: !group || at >= group.last ? entry.text : group.text,
    })
  }
  if (!groups.size) return ''
  let total = 0
  const lines = [...groups.values()].map((group) => {
    total += group.count
    const later = laterAppliedMutationCount(log, group.last)
    return L({
      ko: `- ${group.label}: ${group.count}건. 마지막 결과: ${summary(group.text)}${later ? ` — 그 뒤 같은 도구·같은 대상에 적용된 호출 ${later}건.` : ''}`,
      en: `- ${group.label}: ${group.count} calls. Last result: ${summary(group.text)}${later ? ` — ${later} later applied calls to the same tool and target.` : ''}`,
    })
  })
  const applied = log.filter((item) =>
    APPLIED_MUTATION_STATUSES.has(item.status),
  ).length
  return [
    L({
      ko: `${modelMarker('harnessFact', 'ko')} 이 턴에서 적용되지 않았거나 일부만 적용된 변경 호출 ${total}건(도구 결과 기준):`,
      en: `${modelMarker('harnessFact', 'en')} ${total} change calls in this turn were not applied or were only partially applied (based on tool results):`,
    }),
    ...lines,
    L({
      ko: `이 턴에서 적용된 변경 호출은 ${applied}건입니다.`,
      en: `${applied} change calls were applied in this turn.`,
    }),
  ].join('\n')
}

export function mutationFailureCorrectionNotice(
  latestFailureText: string,
  hasSuccessfulMutation: boolean,
): string {
  return [
    L({
      ko: `${modelMarker('systemNotice', 'ko')} 완료되지 않은 도구 호출의 실제 결과는 다음과 같습니다: ${latestFailureText}`,
      en: `${modelMarker('systemNotice', 'en')} The actual result of the incomplete tool call is: ${latestFailureText}`,
    }),
    hasSuccessfulMutation
      ? L({
          ko: '일부 변경만 성공했습니다. 전체 성공이라고 말하지 말고, 적용된 변경과 거부/실패한 변경을 구분하여 답변에 명확히 보고하십시오.',
          en: `Only some changes succeeded. Do not claim full success; clearly distinguish applied changes from rejected/failed changes in your answer.`,
        })
      : L({
          ko: '해당 호출의 거절/실패를 성공으로 보고하지 마십시오. 이후 성공한 호출이 있다면 구분해서 보고하십시오. 실패만으로 파일 변경 여부를 단정하지 말고 실제 도구 결과가 확인한 상태만 답하십시오.',
          en: `Do not report this rejected/failed call as a success. Report any later successful calls separately. Do not infer file state from failure alone; report only the state confirmed by actual tool results.`,
        }),
    L({
      ko: '이 안내에 대한 답만 쓰지 말고, 사용자의 원래 요청에 대한 최종 답변 전체를 위 사실에 맞게 다시 작성하십시오.',
      en: `Do not reply only to this notice; rewrite your complete final answer to the user's original request so that it is consistent with these facts.`,
    }),
  ].join('\n')
}
