import { t } from '../i18n'

import type { ExportSource } from './exportSession'

/** Read only the current chat's known Run and the fixed diagnostic allowlist. */
export function sessionSources(input: {
  conversationId: string
  pluginDir?: string
  adapter: {
    exists: (path: string) => Promise<boolean>
    read: (path: string) => Promise<string>
  }
  diagnostics: () => unknown
}): ExportSource[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.conversationId))
    throw new Error(t('ui.sessionSources.invalidConversationID'))
  const readJson = async (file: string) =>
    (await input.adapter.exists(file))
      ? (JSON.parse(await input.adapter.read(file)) as unknown)
      : null
  return [
    {
      name: 'run.json',
      scope: 'conversation',
      read: () => readJson(`.verbex/Runs/chat-${input.conversationId}.json`),
    },
    {
      name: 'diagnostics-current.json',
      scope: 'shared',
      read: async () => input.diagnostics(),
    },
    {
      name: 'diagnostics-persisted.json',
      scope: 'shared',
      read: async () =>
        input.pluginDir
          ? readJson(`${input.pluginDir}/coediting-diagnostics.json`)
          : null,
    },
    {
      name: 'diagnostics-previous.json',
      scope: 'shared',
      read: async () =>
        input.pluginDir
          ? readJson(`${input.pluginDir}/coediting-diagnostics.previous.json`)
          : null,
    },
  ]
}
