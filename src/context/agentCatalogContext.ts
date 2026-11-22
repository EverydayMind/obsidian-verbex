import {
  formatCatalogReferences,
  formatExplicitContextBodies,
} from '../prompt/contextVariables'
import type { VerbexContextTrace } from '../verbex/types'

export function formatAgentCatalogContext(
  request: string,
  context: VerbexContextTrace,
  catalogTokenBudget: number,
  catalogCandidateLimit: number,
): string {
  const explicit = formatExplicitContextBodies(context)
  const sections = [
    explicit.mentioned
      ? `## Explicitly attached files\n${explicit.mentioned}`
      : '',
    explicit.currentNote ? `## Current note\n${explicit.currentNote}` : '',
  ].filter(Boolean)
  const candidates = formatCatalogReferences(context, {
    limit: catalogCandidateLimit,
    tokenBudget: catalogTokenBudget,
  })
  if (candidates) {
    sections.push(
      `## Retrieval catalog\nThe following references are candidates only; use discovery/read tools to inspect their bodies.\n${candidates}`,
    )
  }
  if (sections.length === 0) return ''
  return [
    '## Context policy: catalog',
    `Query: ${request}`,
    'Explicitly attached material may be used directly. Non-explicit entries are paths and provenance only, not evidence.',
    sections.join('\n\n'),
  ].join('\n\n')
}
