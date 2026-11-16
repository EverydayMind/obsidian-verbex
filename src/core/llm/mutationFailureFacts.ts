import { modelMarker, stripPluginResultBanner } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import type { ToolCallRequest } from '../../types/tool-call.types'

export type MutationLogEntry = {
  key: string
  tool: string
  target?: string
  status: string
}

const FAILED = new Set(['failed', 'rejected', 'partial'])
const APPLIED = new Set(['applied', 'partial'])
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
            APPLIED.has(item.status),
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
  const applied = log.filter((item) => APPLIED.has(item.status)).length
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
