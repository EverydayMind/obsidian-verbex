import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { tool } from '../tools/toolHelper'

import { getListTasksDefinition } from './listTasksDefinition'
import { getQueryNotesDescription } from './noteQueryDescription'
import { queryNotesProperties } from './queryNotesProperties'

export { noteRead, VAULT_FACT_TOOL_NAMES } from './noteQuerySchema'

export function getNoteQueryDefinitions(
  locale: ModelLocale = getModelLocale(),
) {
  return [
    tool('query_notes', getQueryNotesDescription(locale), queryNotesProperties),
    getListTasksDefinition(locale),
  ]
}
export const NOTE_QUERY_DEFINITIONS = getNoteQueryDefinitions()
