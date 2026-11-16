import type { ToolRegistryEntry } from '../tools/toolCatalogRegistry'

export const noteRead: Omit<ToolRegistryEntry, 'definition'> = {
  category: 'read',
  agentCallable: true,
  workflowCallable: false,
}
export const VAULT_FACT_TOOL_NAMES = [
  'date_calc',
  'calculate',
  'query_notes',
  'list_tasks',
  'audit_links',
] as const

const where = {
  type: 'array',
  description: 'Conditions that must all hold (max 8).',
  maxItems: 8,
  items: {
    type: 'object',
    properties: {
      field: {
        type: 'string',
        description: 'Field name (see the tool description).',
      },
      op: {
        type: 'string',
        description:
          'eq, ne, contains (case-insensitive text); gte, lte (numbers, or dates as YYYY-MM-DD); exists, missing (no value needed).',
        enum: ['eq', 'ne', 'contains', 'gte', 'lte', 'exists', 'missing'],
      },
      value: {
        type: 'string',
        description:
          'Comparison value as a string; omit for exists and missing.',
      },
    },
    required: ['field', 'op'],
  },
}
export const common = {
  folder: {
    type: 'string',
    description: 'Folder path; includes subfolders. Omit for the whole vault.',
  },
  where,
}
