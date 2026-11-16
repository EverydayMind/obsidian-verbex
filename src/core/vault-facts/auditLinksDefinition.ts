import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { tool } from '../tools/toolHelper'

export function getAuditLinksDefinition(
  _locale: ModelLocale = getModelLocale(),
) {
  return tool(
    'audit_links',
    'Audit all links in scope. unresolved returns every missing target and its source note and link count; orphans returns every Markdown note with no incoming link from another note. Counts cover the whole scope; follow nextOffset for all rows. Examples: {kind:"unresolved"}; {kind:"orphans",folder:"Notes"}.',
    {
      kind: {
        type: 'string',
        enum: ['unresolved', 'orphans'],
        description:
          'unresolved (default): missing targets; orphans: Markdown notes with no incoming link from another note.',
      },
      folder: {
        type: 'string',
        description:
          'Recursive scope for source notes (unresolved) or target notes (orphans); omit for the whole vault.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 500,
        description: 'Rows per page, default 100, maximum 500.',
      },
      offset: {
        type: 'number',
        minimum: 0,
        description: 'Zero-based row offset, default 0; follow nextOffset.',
      },
    },
  )
}
export const AUDIT_LINKS_DEFINITION = getAuditLinksDefinition()
