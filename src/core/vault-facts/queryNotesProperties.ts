import { common } from './noteQuerySchema'

export const queryNotesProperties = {
  ...common,
  text: {
    type: 'string',
    maxLength: 200,
    description:
      'Literal, case-insensitive phrase that must appear in the note body (frontmatter excluded). Adds text_count per note and the total number of occurrences.',
  },
  group_by: {
    type: 'string',
    description: 'Field whose values are counted across all matching notes.',
  },
  split_by: {
    type: 'string',
    description:
      'Optional second field for cross-tabulated note counts; requires group_by.',
  },
  group_date: {
    type: 'string',
    enum: ['year', 'month', 'day'],
    description:
      'When a group_by or split_by value is a date, group by year, month or day.',
  },
  sort_by: {
    type: 'string',
    description: 'Field to sort rows by; default file.path.',
  },
  order: {
    type: 'string',
    enum: ['asc', 'desc'],
    description: 'asc (default) or desc.',
  },
  fields: {
    type: 'array',
    maxItems: 6,
    items: { type: 'string' },
    description: 'Up to 6 fields shown on each row.',
  },
  limit: {
    type: 'number',
    minimum: 1,
    maximum: 200,
    description:
      'Rows per page, default 50, maximum 200. Counts and groups always cover all matching notes.',
  },
  offset: {
    type: 'number',
    minimum: 0,
    description: 'Zero-based row offset, default 0.',
  },
}
