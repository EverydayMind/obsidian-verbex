import { App } from 'obsidian'

import { SourceTextReader } from '../core/rag/sourceTextReader'
import { executeDocumentRead } from '../core/tools/documentReadTools'
import { ToolExecutionContext } from '../core/tools/localToolCommon'
import { estimateTokens } from '../utils/llm/estimateTokens'

import { boundSourceText } from './sourceExcerpt'

/**
 * Disk projections only. Never infer original coverage or parse document
 * links. A ready projection that fits the budget is included whole (as a
 * Markdown note of the same size would be) with its revision and extraction
 * coverage stated; otherwise only the outline and matching excerpts.
 */
export async function documentSourceContext(
  app: App,
  path: string,
  query: string,
  budget: number,
  includeWholeWhenFits = false,
): Promise<string> {
  if (includeWholeWhenFits) {
    const status = await new SourceTextReader(app).inspectDocument(path)
    if (status.state === 'ready') {
      const p = status.projection
      const whole = `path=${path}; sourceSha256=${p.sourceSha256}; projectionSchema=v${p.schemaVersion}; pageMode=${p.pageMode ?? 'none'}; version=${status.version}\n[Full disk projection included; line numbers are projection lines, not original pages/paragraphs.${p.truncated ? ' Extraction was truncated: this is not full source coverage.' : ''}]\n${p.projection}`
      if (estimateTokens(whole) <= budget) return whole
    }
  }
  const ctx: ToolExecutionContext = {
    app,
    getContextBudget: () => Math.max(0, budget - 100) * 2,
    getPriorityFolder: () => '',
    getToolRequestLogPath: () => '',
  }
  const outline = await executeDocumentRead(
    'note_outline',
    { path, limit: 12 },
    ctx,
  )
  const body =
    outline?.kind === 'read'
      ? outline.text
      : `path=${path}; document source unavailable`
  if (outline?.kind !== 'read' || outline.facts?.completeness === 'unsupported')
    return boundSourceText(body, budget)
  // Literal alternatives are bounded and escaped before the per-line search.
  const pattern = query
    .split(/\s+/)
    .filter((term) => term.length >= 2)
    .slice(0, 12)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const relevant = pattern
    ? await executeDocumentRead(
        'search_in_file',
        { path, pattern, context_lines: 1, max_matches: 3 },
        ctx,
      )
    : null
  const text = `${body}\n[Disk projection excerpts only; full source coverage not established.]\n${relevant?.kind === 'read' ? relevant.text : ''}`
  return boundSourceText(text, budget)
}
