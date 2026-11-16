import type { ModelLocale } from '../../i18n/modelLocale'

import * as modelText from './connectorModelText'
import { connectorManifestSchema } from './manifestSchema'

export function tasksConnectorPreset(locale?: ModelLocale) {
  return connectorManifestSchema.parse({
    id: 'tasks',
    enabled: false,
    target: {
      pluginId: 'obsidian-tasks-plugin',
      access: { kind: 'pluginProperty', path: ['apiV1'] },
    },
    tools: [
      {
        name: 'toggle_done',
        method: 'executeToggleTaskDoneCommand',
        effect: 'pure',
        description: modelText.tasksDescription(locale),
        args: [{ from: 'line' }, { vaultPath: 'path' }],
        inputSchema: {
          type: 'object',
          required: ['line', 'path'],
          additionalProperties: false,
          properties: {
            line: { type: 'string', minLength: 1, maxLength: 2000 },
            path: { type: 'string', minLength: 1, maxLength: 512 },
          },
        },
        result: { format: 'text', maxChars: 4000 },
        timeoutMs: 3000,
        routeKeywords: [
          '할 일',
          '작업 완료',
          'task',
          'todo',
          'to-do',
          'action item',
          'mark done',
          'check off',
        ],
        options: { disabled: false, agentCallable: true },
      },
    ],
  })
}
