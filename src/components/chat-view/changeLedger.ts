import type { AgentLoopResult } from '../../core/llm/agentLoop'
import { t } from '../../i18n'
import { inlineCode } from '../../utils/inlineCode'

export function changeLedger(
  mutations: AgentLoopResult['mutations'],
  priorApplied: boolean,
): { content: string; applied: number } | undefined {
  if (!mutations.length)
    return priorApplied
      ? {
          content: t('ui.changeLedger.changeLedgerNoMutationCallsExecutedIn'),
          applied: 0,
        }
      : undefined
  const counts = { applied: 0, partial: 0, failed: 0, unknown: 0 }
  const groups = new Map<string, { label: string; count: number }>()
  for (const mutation of mutations) {
    const status =
      mutation.status === 'applied' || mutation.status === 'partial'
        ? mutation.status
        : mutation.status === 'failed' || mutation.status === 'rejected'
          ? 'failed'
          : 'unknown'
    counts[status]++
    const label = `${{ applied: t('ui.changeLedger.applied'), partial: t('ui.changeLedger.partiallyApplied'), failed: t('ui.changeLedger.failedDenied'), unknown: t('ui.changeLedger.unchangedUnknown') }[status]}: ${inlineCode(mutation.tool)}${mutation.target ? ` (${inlineCode(mutation.target)})` : ''}`
    const key = JSON.stringify([status, mutation.tool, mutation.target])
    const group = groups.get(key)
    groups.set(key, { label, count: (group?.count ?? 0) + 1 })
  }
  const summary = (
    [
      [t('ui.changeLedger.applied2'), counts.applied],
      [t('ui.changeLedger.partiallyApplied2'), counts.partial],
      [t('ui.changeLedger.failedDenied2'), counts.failed],
      [t('ui.changeLedger.unchangedUnknown2'), counts.unknown],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(', ')
  const entries = [...groups.values()]
  const lines = entries
    .slice(0, 8)
    .map(
      ({ label, count }) =>
        `- ${label}${count > 1 ? t('ui.changeLedger.calls', { p0: count }) : ''}`,
    )
  const omitted = entries.slice(8).reduce((sum, entry) => sum + entry.count, 0)
  if (omitted) lines.push(t('ui.changeLedger.andMore', { p0: omitted }))
  return {
    content: [
      t('ui.changeLedger.changeLedgerMutationCallsInThisTurn', {
        p0: mutations.length,
        p1: summary,
      }),
      ...lines,
    ].join('\n'),
    applied: counts.applied + counts.partial,
  }
}
