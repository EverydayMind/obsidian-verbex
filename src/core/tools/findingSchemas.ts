import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { findingColumns, noteFormat } from '../../i18n/noteFormats'

export type FindingColumn = {
  name: string
  enum?: string[]
}

export type FindingSchema = {
  id: string
  columns: FindingColumn[]
}

export function builtinFindingSchemas(
  locale: ModelLocale = getModelLocale(),
): Record<string, FindingSchema> {
  const issue = findingColumns(locale)
  const rule = findingColumns(locale, true)
  return {
    issue_table_v1: {
      id: 'issue_table_v1',
      columns: [
        { name: '#' },
        { name: issue[1], enum: ['Critical', 'Major', 'Minor', 'Suggestion'] },
        ...issue.slice(2).map((name) => ({ name })),
      ],
    },
    rule_issue_table_v1: {
      id: 'rule_issue_table_v1',
      columns: [
        ...rule.slice(0, -1).map((name) => ({ name })),
        {
          name: rule[5],
          enum: ['high', 'medium', 'low'].map((key) =>
            noteFormat(key as 'high' | 'medium' | 'low', locale),
          ),
        },
      ],
    },
  }
}
export const BUILTIN_FINDING_SCHEMAS = builtinFindingSchemas('ko')

export function findingSchema(
  id = 'issue_table_v1',
  customColumns?: (string | { name: string; enum?: string[] })[],
  locale: ModelLocale = getModelLocale(),
): FindingSchema {
  if (customColumns?.length) {
    return {
      id,
      columns: customColumns.map((column) =>
        typeof column === 'string' ? { name: column } : column,
      ),
    }
  }
  const schemas = builtinFindingSchemas(locale)
  return schemas[id] ?? schemas.issue_table_v1
}

export function parseFindingSchemaColumns(
  value: string | null,
): FindingColumn[] | undefined {
  if (!value) return undefined
  try {
    const normalized =
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
        ? value.slice(1, -1)
        : value
    const parsed = JSON.parse(normalized.replace(/''/g, "'")) as unknown
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is FindingColumn =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as FindingColumn).name === 'string',
        )
      : undefined
  } catch {
    return undefined
  }
}

export function findingSchemaTemplate(schema: FindingSchema): string[] {
  const names = schema.columns.map((column) => column.name)
  const example = schema.columns.map((column, index) => {
    if (index === 0) return '1'
    return column.enum?.[0] ?? `[${column.name}]`
  })
  return [
    `| ${names.join(' | ')} |`,
    `| ${names.map(() => '---').join(' | ')} |`,
    `| ${example.join(' | ')} |`,
  ]
}
