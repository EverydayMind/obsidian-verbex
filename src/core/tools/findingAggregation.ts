import { t } from '../../i18n'
import { getModelLocale } from '../../i18n/modelLocale'
import {
  noteFormat,
  noteFormatMatches,
  noteVocabulary,
} from '../../i18n/noteFormats'

import { countIssueTableRows } from './findingMarkdown'
import {
  builtinFindingSchemas,
  parseFindingSchemaColumns,
} from './findingSchemas'

type Column = { name: string; index: number; values: string[] }
export type FindingAggregation = {
  grade: Column | null
  type: Column | null
  legacy: boolean
  builtin?: boolean
}

export function findingAggregation(
  value: string | null,
  locale = getModelLocale(),
): FindingAggregation {
  const columns = parseFindingSchemaColumns(value)
  if (!columns?.length)
    return {
      grade: {
        name: noteFormat('severity', locale),
        index: 1,
        values: ['Critical', 'Major', 'Minor', 'Suggestion'],
      },
      type: { name: noteFormat('type', locale), index: 2, values: [] },
      legacy: true,
    }
  const gradeIndex = columns.findIndex(
    (column) => Array.isArray(column.enum) && column.enum.length > 0,
  )
  const typeIndex = columns.findIndex(
    (column) =>
      column.name.endsWith(noteFormat('type', 'ko')) ||
      /(?:^|[\s_-])type$/i.test(column.name) ||
      /[a-z]Type$/.test(column.name),
  )
  return {
    grade:
      gradeIndex < 0
        ? null
        : {
            name: columns[gradeIndex].name,
            index: gradeIndex,
            values: columns[gradeIndex].enum ?? [],
          },
    type:
      typeIndex < 0
        ? null
        : { name: columns[typeIndex].name, index: typeIndex, values: [] },
    legacy: false,
    builtin: (['ko', 'en'] as const).some((language) =>
      Object.values(builtinFindingSchemas(language)).some(
        (schema) => JSON.stringify(schema.columns) === JSON.stringify(columns),
      ),
    ),
  }
}

export function findingAggregationSummary(
  text: string,
  aggregation: FindingAggregation,
): string {
  const grade = aggregation.grade
  if (!grade)
    return t('findingAggregationR8.issueCount', {
      count: countIssueTableRows(text),
    })
  const counts = new Map(grade.values.map((value) => [value, 0]))
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
    const value = cells[grade.index]?.trim()
    const key = priorityValue(value ?? '', grade, aggregation)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const rendered = [...counts]
    .map(([value, count]) => `${value} ${count}`)
    .join(', ')
  return aggregation.legacy ? rendered : `${grade.name} ${rendered}`
}

export function addFindingAggregationRow(
  line: string,
  aggregation: FindingAggregation,
  grades: Map<string, number>,
  types: Map<string, number>,
): void {
  const cells = line.split('|')
  // Without a declared grade column the issue table still reports the total.
  if (!aggregation.grade) {
    const total = noteFormat('total', 'ko')
    grades.set(total, (grades.get(total) ?? 0) + 1)
  }
  for (const [column, counts] of [
    [aggregation.grade, grades],
    [aggregation.type, types],
  ] as const) {
    if (!column) continue
    const raw = cells[column.index + 1]?.trim() ?? 'Unknown'
    const value = priorityValue(raw, column, aggregation)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
}

function priorityValue(
  value: string,
  column: Column,
  aggregation: FindingAggregation,
) {
  return aggregation.builtin &&
    column === aggregation.grade &&
    noteFormatMatches(column.name, 'priority')
    ? (column.values.find(
        (allowed) =>
          noteVocabulary(allowed, 'ko') === noteVocabulary(value, 'ko'),
      ) ?? value)
    : value
}

export function renderFindingAggregations(
  aggregation: FindingAggregation,
  grades: Map<string, number>,
  types: Map<string, number>,
  locale = getModelLocale(),
): string[] {
  const nameFor = (name: string) =>
    aggregation.legacy || aggregation.builtin
      ? noteVocabulary(name, locale)
      : name
  const table = (
    name: string,
    counts: Map<string, number>,
    priority = false,
  ) => [
    `| ${name} | ${noteFormat('count', locale)} |`,
    '| --- | ---: |',
    ...[...counts].map(
      ([key, value]) =>
        `| ${counts === grades && !aggregation.grade && key === noteFormat('total', 'ko') ? noteFormat('total', locale) : priority ? noteVocabulary(key, locale) : key} | ${value} |`,
    ),
    '',
  ]
  return [
    noteFormat('issueTotals', locale),
    ...table(
      nameFor(aggregation.grade?.name ?? noteFormat('issueLabel', locale)),
      grades,
      Boolean(
        aggregation.builtin &&
          noteFormatMatches(aggregation.grade?.name ?? '', 'priority'),
      ),
    ),
    ...(aggregation.type
      ? [
          noteFormat('typeTotals', locale),
          ...table(nameFor(aggregation.type.name), types),
        ]
      : []),
  ]
}
