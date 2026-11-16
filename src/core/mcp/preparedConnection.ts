import { L } from '../../i18n/modelText'
import type { McpServerParameters } from '../../types/mcp.types'

import {
  McpSecretReader,
  resolveMcpCredential,
  resolveMcpToken,
} from './credentials'
import { openMcpConnection } from './mcpConnection'

/** Capture credentials only after refresh and recheck before publishing a client. */
export async function openPreparedMcpConnection(
  parameters: McpServerParameters,
  env: Record<string, string>,
  readSecret: McpSecretReader | undefined,
  prepare: ((parameters: McpServerParameters) => Promise<void>) | undefined,
  active: () => boolean,
) {
  if (prepare) await prepare(parameters)
  if (!active())
    throw new Error(
      L({
        ko: 'MCP 연결이 취소되었습니다.',
        en: 'The MCP connection was cancelled.',
      }),
    )
  const token = resolveMcpToken(parameters, readSecret)
  const credential = resolveMcpCredential(parameters, readSecret)
  const connection = await openMcpConnection(parameters, env, readSecret, token)
  try {
    if (
      !active() ||
      credential !== resolveMcpCredential(parameters, readSecret)
    )
      throw new Error(
        L({
          ko: 'MCP 연결 또는 Keychain 토큰이 변경됐습니다. 다시 연결하세요.',
          en: 'The MCP connection or Keychain token changed. Connect again.',
        }),
      )
    return { ...connection, credential }
  } catch (error) {
    void connection.client.close()
    throw error
  }
}
