import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import { RequestTool } from '../../types/llm/request'

import { ToolRegistryEntry } from './toolDefinitions'
import { tool } from './toolHelper'

export function getIndexToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    tool(
      'build_review_index',
      'Deterministically convert a source note or folder into a unit/term review index and review checklist. Use preview first for unfamiliar documents. For ordinary notes and reports pass structure_profile=headings (Markdown # headings) or token_chunks: the default legal-numbered only fits sources with Article/제N조/ANNEX lines (or boundaries supplied by the active workflow) and fails otherwise. The source is never modified.',
      {
        source_path: {
          type: 'string',
          description:
            'Vault-relative source note. Set exactly one of source_path or source_folder.',
        },
        source_folder: {
          type: 'string',
          description:
            'Folder containing source Markdown notes. Omit when source_path is set.',
        },
        index_folder: {
          type: 'string',
          description: 'Destination review index folder.',
        },
        max_unit_tokens: {
          type: 'number',
          description: 'Maximum tokens per unit; default 4000.',
        },
        preview: {
          type: 'boolean',
          description: 'Return structure only; write nothing.',
        },
        structure_profile: {
          type: 'string',
          description:
            'legal-numbered (default; needs Article/제N조/ANNEX lines unless the workflow supplies boundaries), headings (Markdown # headings), token_chunks, or workflow-defined.',
        },
        structure_boundaries: {
          type: 'array',
          items: { type: 'object' },
          description:
            'Do not set; the runtime fills this from the active workflow. Validated boundary rules supplied by the active workflow.',
        },
        finding_schema: {
          type: 'string',
          description:
            'Do not set; the runtime fills this from the active workflow. Finding schema id recorded in the checklist.',
        },
        checklist_phases: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Do not set; the runtime fills this from the active workflow. Checklist phase ids supplied by the active workflow.',
        },
        finding_schema_columns: {
          type: 'array',
          items: { type: 'object' },
          description:
            'Do not set; the runtime fills this from the active workflow. Resolved declarative schema columns supplied by the workflow runtime.',
        },
        rebuild: {
          type: 'boolean',
          description: 'Regenerate units while preserving findings.',
        },
      },
      ['index_folder'],
    ),
    tool(
      'checklist_next',
      'Return exactly one next review-index checklist item with its bounded unit body. Always call this first on every review turn.',
      {
        index_folder: {
          type: 'string',
          description:
            'Optional review index folder; auto-discovered when omitted.',
        },
        item_id: {
          type: 'string',
          description: L(
            {
              ko: 'Optional. Omit to get the next pending item. Only pass an id shown as [현재 항목] in an earlier checklist_next result (e.g. R:001); never invent one.',
              en: `Optional. Omit to get the next pending item. Only pass an id shown as ${modelMarker('currentItem', locale)} in an earlier checklist_next result (e.g. R:001); never invent one.`,
            },
            locale,
          ),
        },
      },
    ),
    tool(
      'submit_finding',
      'Atomically write one server-frontmattered finding and mark its checklist item in one approval batch. For done, findings_markdown must be the Markdown table from the template that checklist_next returned, and issues its data-row count.',
      {
        index_folder: { type: 'string' },
        item_id: { type: 'string' },
        status: { type: 'string', enum: ['done', 'skipped'] },
        findings_markdown: {
          type: 'string',
          description: `Body only; no frontmatter. Required for done: a Markdown table with the columns of the template returned by checklist_next; each data row starts with its row number. Data row count must equal "issues".`,
        },
        issues: {
          type: 'number',
          description: 'Number of data rows in findings_markdown.',
        },
        note: { type: 'string', description: 'Required skip reason.' },
      },
      ['index_folder', 'item_id', 'status'],
    ),
    tool(
      'audit_index',
      'Deterministically audit unresolved internal references, term variants, unused definitions, and checklist coverage. With output_path it writes the audit and completes C:auto.',
      {
        index_folder: { type: 'string' },
        output_path: {
          type: 'string',
          description:
            'To complete the checklist item C:auto, pass exactly findings/_auto-consistency.md (the result path checklist_next shows). C:auto is a checklist item id, not a path value. Omit output_path to only read the audit; C:auto then stays pending.',
        },
      },
      ['index_folder'],
    ),
    tool(
      'compile_report',
      'Deterministically compile validated findings in checklist order and complete F:report in the same approval batch. Fails unless every non-F checklist item is done or skipped; call checklist_next until it reports F:report.',
      {
        index_folder: { type: 'string' },
        output_path: {
          type: 'string',
          description:
            'Optional; path inside index_folder (default _report.md).',
        },
        summary: {
          type: 'string',
          description: L(
            {
              ko: 'Korean overall assessment, at most 15 lines.',
              en: 'Overall assessment, at most 15 lines.',
            },
            locale,
          ),
        },
      },
      ['index_folder'],
    ),
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const INDEX_TOOL_DEFINITIONS = getIndexToolDefinitions()

export const INDEX_TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  checklist_next: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    artifactBinding: { argument: 'index_folder', mode: 'soft' },
    evictionKind: 'directive',
    evictable: false,
    executor: 'review-index',
  },
  build_review_index: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    selfContainedSource: true,
    confirmTarget: true,
    executor: 'review-index',
  },
  submit_finding: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    artifactBinding: { argument: 'index_folder', mode: 'hard' },
    executor: 'review-index',
  },
  audit_index: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    artifactBinding: { argument: 'index_folder', mode: 'hard' },
    executor: 'review-index',
    executorArgument: 'output_path',
  },
  compile_report: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    artifactBinding: { argument: 'index_folder', mode: 'hard' },
    executor: 'review-index',
  },
}
