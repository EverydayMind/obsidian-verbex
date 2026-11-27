import { FORMAT_SOURCE_NOTICE } from '../context/formatSourceNotice'
import { isDocumentPath } from '../core/rag/documentSources/indexableSources'
import { L } from '../i18n/modelText'
import { estimateTokens } from '../utils/llm/estimateTokens'
import { citationLink } from '../utils/sourceCitation'
import { VerbexContextTrace, VerbexContextTraceItem } from '../verbex/types'

import { provenance } from './contextProvenance'
import { PromptVariables, StepOutput } from './PromptTemplateEngine'

/**
 * Maps a built context trace (M3 ContextBuilder output) into the built-in
 * prompt variables consumed by step templates (M4 PromptTemplateEngine). Only
 * items actually included in the context are rendered, grouped by source so a
 * template can reference `{{mentioned_notes}}`, `{{wiki}}`, `{{search_results}}`,
 * `{{linked_notes}}` and `{{base_results}}` independently.
 */

/** Human-readable label for each retrieval source, so the model can judge how
 *  much to trust an item (an explicit attachment vs. a one-shared-tag relative). */

function formatItem(item: VerbexContextTraceItem): string {
  const heading = item.heading ? ` › ${item.heading}` : ''
  const snippet = item.snippet.trim()
  const notice = item.formatSource ? `\n  ${FORMAT_SOURCE_NOTICE()}` : ''
  if (isDocumentPath(item.path))
    return `- [${item.path}${heading}] (document_extract; KORDOC extraction; original formatting, footnotes and image text may be omitted${item.documentOcrCandidatePages?.length ? '; OCR candidate pages with missing or unreliable text: ' + item.documentOcrCandidatePages.join(', ') : ''})${notice}\n${indent(snippet)}`
  const location = item.sourceCitation
    ? L({
        ko: `\n  출처 링크: ${citationLink(item.sourceCitation)}`,
        en: `\n  Source link: ${citationLink(item.sourceCitation)}`,
      })
    : ''
  return `- [${item.path}${heading}] (${provenance(item)})${location}${notice}\n${indent(snippet)}`
}

/**
 * One-line reference for an item that was found but NOT placed in context (token
 * budget or relevance trim). No snippet — the point is that it was dropped to
 * save budget, so re-spending budget on its body would defeat the purpose. The
 * model still learns the note exists and can pull it with `read_file` if the
 * request turns out to need it.
 */
function formatExcludedItem(item: VerbexContextTraceItem): string {
  const heading = item.heading ? ` › ${item.heading}` : ''
  return `- [${item.path}${heading}] (${provenance(item)})`
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

function group(
  items: VerbexContextTraceItem[],
  sources: VerbexContextTraceItem['source'][],
): string {
  return items
    .filter((item) => item.included_in_context && sources.includes(item.source))
    .map(formatItem)
    .join('\n\n')
}

/**
 * Items that were retrieved but evicted before reaching the model — dropped by
 * the token budget or trimmed as low-relevance. Surfacing them (path + source +
 * score, no body) makes the discard visible: the model knows the note exists,
 * can weigh whether the request needs it, and can pull it with `read_file`
 * instead of the note silently vanishing. The `current_note` is never listed —
 * it is the active file, not a discardable retrieval.
 */
function excludedReferences(items: VerbexContextTraceItem[]): string {
  const lines = items
    .filter(
      (item) => !item.included_in_context && item.source !== 'current_note',
    )
    .map(formatExcludedItem)
  const maxItems = 50
  const visible = lines.slice(0, maxItems)
  if (lines.length > maxItems) {
    visible.push(`- ... ${lines.length - maxItems} excluded references omitted`)
  }
  return visible.join('\n')
}

/**
 * Compact, body-less candidate list for re-grounding a follow-up turn (A-3).
 *
 * Turns after the first are not re-injected with the bulk context pack — that
 * would duplicate bodies and bloat the multi-turn context — but a weak model may
 * then answer a fresh question without searching at all. This renders the most
 * relevant notes for the new query as `path + source + relevance signal` only
 * (no bodies, so it stays cheap and never re-spends budget on content the model
 * did not ask for), so the model knows what exists and can pull the few it needs
 * with `read_file`. Ranked by whether the builder would have included the item,
 * then by score; the active note is dropped, paths are de-duplicated across
 * sources, and the list is capped at `limit`.
 */
export function formatCandidateReferences(
  trace: VerbexContextTrace | null,
  limit = 12,
): string {
  const items = (trace?.items ?? []).filter(
    (item) => item.source !== 'current_note',
  )
  if (items.length === 0) {
    return ''
  }
  const ranked = [...items].sort((a, b) => {
    if (a.included_in_context !== b.included_in_context) {
      return a.included_in_context ? -1 : 1
    }
    return (b.score ?? -Infinity) - (a.score ?? -Infinity)
  })
  const seen = new Set<string>()
  const lines: string[] = []
  for (const item of ranked) {
    if (seen.has(item.path)) {
      continue
    }
    seen.add(item.path)
    lines.push(formatExcludedItem(item))
    if (lines.length >= limit) {
      break
    }
  }
  return lines.join('\n')
}

/** Body-bearing sections that must survive catalog/off decisions when the user
 * explicitly attached a file or the builder retained the active note. */
export function formatExplicitContextBodies(trace: VerbexContextTrace | null): {
  mentioned: string
  currentNote: string
} {
  const items = trace?.items ?? []
  return {
    mentioned: group(items, ['mentioned']),
    currentNote: group(items, ['current_note']),
  }
}

/**
 * First-turn catalog: bodyless references for non-explicit retrieval sources.
 * Unlike formatCandidateReferences, this deliberately excludes both
 * `mentioned` and `current_note`, because those are rendered separately with
 * their bodies when the user supplied them or the mode permits them.
 */
export function formatCatalogReferences(
  trace: VerbexContextTrace | null,
  options: { limit: number; tokenBudget: number },
): string {
  const items = (trace?.items ?? []).filter(
    (item) => item.source !== 'current_note' && item.source !== 'mentioned',
  )
  const ranked = [...items].sort((a, b) => {
    if (a.included_in_context !== b.included_in_context) {
      return a.included_in_context ? -1 : 1
    }
    return (b.score ?? -Infinity) - (a.score ?? -Infinity)
  })
  const seen = new Set<string>()
  const lines: string[] = []
  let usedTokens = 0
  for (const item of ranked) {
    if (seen.has(item.path)) continue
    const line = formatExcludedItem(item)
    const lineTokens = estimateTokens(line)
    if (
      lines.length >= options.limit ||
      (lines.length > 0 && usedTokens + lineTokens > options.tokenBudget)
    ) {
      break
    }
    seen.add(item.path)
    lines.push(line)
    usedTokens += lineTokens
  }
  return lines.join('\n')
}

export type ExtraPromptVariables = {
  user_request?: string
  prev_step_output?: string
  skill_instructions?: string
  correction_feedback?: string
  steps?: Record<string, StepOutput>
}

export function buildPromptVariables(
  trace: VerbexContextTrace | null,
  extra: ExtraPromptVariables = {},
): PromptVariables {
  const items = trace?.items ?? []
  const linkedNotes = group(items, ['wikilink', 'backlink', 'tag'])
  const hasCurrentNote = items.some(
    (item) => item.source === 'current_note' && item.included_in_context,
  )
  const backlinkNotice = items.some(
    (item) => item.source === 'backlink' && item.included_in_context,
  )
    ? L({
        ko: `백링크는 관련도로 고른 일부입니다. 전체 수는 ${hasCurrentNote ? '활성 노트 머리 줄' : 'vault_graph'}을 보세요.`,
        en: `Backlink excerpts are selected by relevance. See ${hasCurrentNote ? 'the active note header' : 'vault_graph'} for the total.`,
      }) + '\n'
    : ''
  return {
    user_request: extra.user_request ?? trace?.query ?? '',
    mentioned_notes: group(items, ['mentioned']),
    wiki: group(items, ['wiki']),
    search_results: group(items, ['bm25', 'semantic', 'current_note']),
    linked_notes: backlinkNotice + linkedNotes,
    base_results: group(items, ['base']),
    excluded_context: excludedReferences(items),
    prev_step_output: extra.prev_step_output ?? '',
    skill_instructions: extra.skill_instructions ?? '',
    correction_feedback: extra.correction_feedback ?? '',
    steps: extra.steps ?? {},
  }
}
