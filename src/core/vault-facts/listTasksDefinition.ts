import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { tool } from '../tools/toolHelper'

import { common } from './noteQuerySchema'

export function getListTasksDefinition(
  _locale: ModelLocale = getModelLocale(),
) {
  return tool(
    'list_tasks',
    'List Markdown checkbox tasks (- [ ] / - [x]) across a folder, a single note or the whole vault in one call, with the total count. Each task is returned as its note path, line number and the original line. Use this instead of reading notes one by one to collect action items. status selects open (default), done or all; where filters notes with the same conditions as query_notes (for example a date range on the date property); text keeps only task lines containing a phrase. group_by: "owner" groups the tasks by owner (the name after an owner label such as "Owner:", else a leading "Name:", else an @name, else the first [[link]] in the line); use it when the request asks for tasks per person.',
    {
      ...common,
      path: {
        type: 'string',
        description: 'A single note path. Cannot be combined with folder.',
      },
      text: {
        type: 'string',
        maxLength: 200,
        description:
          'Literal, case-insensitive phrase that must appear in the task line.',
      },
      status: {
        type: 'string',
        enum: ['open', 'done', 'all'],
        description: 'open (default), done or all.',
      },
      group_by: {
        type: 'string',
        enum: ['owner'],
        description: 'Group tasks by owner.',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 300,
        description: 'Task lines per page, default 100, maximum 300.',
      },
      offset: {
        type: 'number',
        minimum: 0,
        description: 'Zero-based offset, default 0.',
      },
    },
  )
}
export const LIST_TASKS_DEFINITION = getListTasksDefinition()
