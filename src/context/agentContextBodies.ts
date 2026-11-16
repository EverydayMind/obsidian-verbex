import { buildPromptVariables } from '../prompt/contextVariables'
import type { VerbexContextTrace } from '../verbex/types'

export function formatContextBodies(
  context: VerbexContextTrace,
  request: string,
): { sections: string[]; excluded: string } {
  const variables = buildPromptVariables(context, { user_request: request })
  const sections = [
    ['Attached files', variables.mentioned_notes],
    ['Summary wiki', variables.wiki],
    ['Search results', variables.search_results],
    ['Linked notes', variables.linked_notes],
    ['Dataview results', variables.dataview_results],
    ['Base results', variables.base_results],
  ]
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([label, value]) => `## ${String(label)}\n${String(value)}`)

  // Items retrieved but evicted (token budget or low-relevance trim). Listed
  // without bodies so the model knows they exist and can pull any it needs,
  // instead of a budget-dropped note silently disappearing.
  const excluded =
    typeof variables.excluded_context === 'string'
      ? variables.excluded_context.trim()
      : ''

  return { sections, excluded }
}
