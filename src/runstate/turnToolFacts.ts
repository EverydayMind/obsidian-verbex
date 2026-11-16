import type { AgentToolOutcome } from '../core/llm/toolOutcome'
import type { ToolCallRequest } from '../types/tool-call.types'

import { commitTurnFacts, commitWrites } from './commitTurnFacts'
import { recordOutcomeRead } from './documentReadFacts'
import type { TurnRecord } from './turnLedger'

/** Persist only structured facts; never result text or argument objects. */
export function recordTurnToolOutcome(
  record: TurnRecord,
  call: ToolCallRequest,
  outcome: AgentToolOutcome,
): void {
  const facts = outcome.readFacts
  let path: string | undefined
  let destination: string | undefined
  let offset: number | undefined
  try {
    const args = JSON.parse(
      outcome.privateTranscript ? '{}' : (call.arguments ?? '{}'),
    ) as Record<string, unknown>
    path =
      typeof args.path === 'string'
        ? args.path
        : typeof args.folder === 'string'
          ? args.folder
          : undefined
    destination = typeof args.new_path === 'string' ? args.new_path : path
    offset =
      typeof args.offset === 'number' && args.offset > 0
        ? Math.floor(args.offset)
        : undefined
    path ??= pagedQueryTarget(args)
  } catch {
    /* no valid structured target */
  }
  // e.g. export_property_query picks its default path on the host.
  destination = outcome.changedPath ?? destination
  path ??= outcome.changedPath
  const commit = commitTurnFacts(outcome)
  recordOutcomeRead(record, outcome, path)
  record.toolCalls.push({
    name: call.name,
    status: outcome.status,
    mutation: outcome.mutation,
    ...(outcome.mutationScope ? { mutationScope: outcome.mutationScope } : {}),
    completeness: facts?.completeness,
    errorCode: facts?.errorCode,
    target: path,
    ...(commit ? { commit } : {}),
    ...(outcome.reportStyleReceipt
      ? { reportStyleReceipt: outcome.reportStyleReceipt }
      : {}),
    ...(outcome.documentJobReceipt
      ? { documentJobReceipt: outcome.documentJobReceipt }
      : {}),
    ...(outcome.decompositionReceipt
      ? { decompositionReceipt: outcome.decompositionReceipt }
      : {}),
    ...(outcome.binaryReceipt ? { binaryReceipt: outcome.binaryReceipt } : {}),
  })
  if (facts?.omittedPaths) record.evidence.omitted.push(...facts.omittedPaths)
  // A last page (offset > 0, no nextOffset) is kept too, so a later turn
  // can see that the paged query reached its end.
  if (
    facts &&
    (facts.coverage ||
      facts.completeness === 'partial' ||
      facts.nextOffset !== undefined ||
      (offset !== undefined && facts.total !== undefined))
  )
    record.truncations.push({
      tool: call.name,
      total: facts.total,
      returned: facts.returned,
      nextOffset: facts.nextOffset,
      target: path,
      ...(offset !== undefined ? { offset } : {}),
      ...(facts.coverage ? { coverage: facts.coverage } : {}),
    })
  if (commit) record.writes.push(...commitWrites(call.name, commit))
  else if (
    !outcome.privateTranscript &&
    !outcome.commit &&
    destination &&
    outcome.mutation !== 'none'
  )
    record.writes.push({
      tool: call.name,
      path: destination,
      mutation: outcome.mutation,
    })
}

/** Identity of a property query: same key/value/filter means same row set. */
function pagedQueryTarget(args: Record<string, unknown>): string | undefined {
  const key = args.key ?? args.property
  if (typeof key !== 'string' || typeof args.value !== 'string')
    return undefined
  const list = (v: unknown) =>
    Array.isArray(v) && v.length
      ? JSON.stringify([...(v as unknown[])].sort())
      : ''
  const filter =
    typeof args.filter_field === 'string'
      ? ` ${args.filter_field}${list(args.include_values) && ` in ${list(args.include_values)}`}${list(args.exclude_values) && ` not ${list(args.exclude_values)}`}`
      : ''
  return `${key}=${args.value}${filter}`
}
