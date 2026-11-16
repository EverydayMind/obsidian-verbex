import type { ContextBuildResult } from '../context/ContextBuilder'
import type { AuditEvent } from '../types/chat'

export type ContextAuditFact = {
  kind: Extract<AuditEvent['kind'], 'context_retrieval' | 'context_exclusion'>
  summary: string
  details: Record<string, number | string | boolean>
}

export function summarizeContextAudit(
  context: ContextBuildResult,
): ContextAuditFact[] {
  const included = context.items.filter(
    (item) => item.included_in_context,
  ).length
  const searchItems = context.items.filter(
    (item) => item.source === 'semantic' || item.source === 'bm25',
  )
  const facts: ContextAuditFact[] = [
    {
      kind: 'context_retrieval',
      summary: 'Context retrieval completed',
      details: {
        candidateCount: context.items.length,
        includedCount: included,
        excludedCount: context.items.length - included,
        searchCandidateCount: searchItems.length,
        searchIncludedCount: searchItems.filter(
          (item) => item.included_in_context,
        ).length,
      },
    },
  ]
  if (context.items.length > included) {
    const lexicalGateCount = context.items.filter(
      (item) => item.exclusionReason === 'lexical_gate',
    ).length
    facts.push({
      kind: 'context_exclusion',
      summary: 'Context candidates excluded by selection or budget',
      details: {
        excludedCount: context.items.length - included,
        ...(lexicalGateCount > 0 ? { lexicalGateCount } : {}),
      },
    })
  }
  return facts
}
