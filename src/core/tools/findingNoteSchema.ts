import { noteFormatLocale } from '../../i18n/noteFormats'

import {
  builtinFindingSchemas,
  findingSchema,
  parseFindingSchemaColumns,
} from './findingSchemas'
import { frontmatterValue } from './reviewIndexMetadata'
export function findingNoteSchema(checklist: string, existingFinding = '') {
  const id = frontmatterValue(checklist, 'schema') ?? 'issue_table_v1'
  const columns = parseFindingSchemaColumns(
    frontmatterValue(checklist, 'schema_columns'),
  )
  const builtin = (['ko', 'en'] as const).some(
    (locale) =>
      JSON.stringify(builtinFindingSchemas(locale)[id]?.columns) ===
      JSON.stringify(columns),
  )
  return findingSchema(
    id,
    builtin ? undefined : columns,
    noteFormatLocale(existingFinding),
  )
}
