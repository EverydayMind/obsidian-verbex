import { McpSecretReader, mcpConfigHash } from '../../core/mcp/credentials'
import { parseToolName } from '../../core/mcp/tool-name-utils'
import type { McpToolIdentity } from '../../core/mcp/toolCatalog'
import type { VerbexSettings } from '../../settings/schema/setting.types'

import * as modelText from './automaticApprovalText'

export async function saveMcpAutomaticApproval(
  getSettings: () => VerbexSettings,
  save: (settings: VerbexSettings) => Promise<void>,
  name: string,
  identity: McpToolIdentity | undefined,
  readSecret?: McpSecretReader,
): Promise<void> {
  const settings = getSettings()
  const { serverName, toolName } = parseToolName(name)
  const server = settings.mcp.servers.find((entry) => entry.id === serverName)
  if (!server) throw new Error(modelText.mcpSettingsMissing())
  if (
    identity &&
    (identity.serverConfigHash !==
      (await mcpConfigHash(server.parameters, readSecret)) ||
      getSettings() !== settings)
  )
    throw new Error(modelText.mcpSettingsChanged())
  await save({
    ...settings,
    mcp: {
      ...settings.mcp,
      servers: settings.mcp.servers.map((entry) =>
        entry.id === serverName
          ? {
              ...entry,
              toolOptions: {
                ...entry.toolOptions,
                [toolName]: {
                  ...entry.toolOptions[toolName],
                  allowAutoExecution: Boolean(identity),
                  autoApproval: identity
                    ? {
                        serverConfigHash: identity.serverConfigHash,
                        toolSchemaHash: identity.toolSchemaHash,
                      }
                    : undefined,
                },
              },
            }
          : entry,
      ),
    },
  })
}
