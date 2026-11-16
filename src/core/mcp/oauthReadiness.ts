import type { McpServerParameters, McpServerState } from '../../types/mcp.types'

import { isOAuth } from './oauthStore'

/** Refresh before candidate snapshots; execution never retries an authenticated call. */
export async function prepareOAuthConnections(
  servers: readonly McpServerState[],
  prepare: ((parameters: McpServerParameters) => Promise<void>) | undefined,
  ready: (server: McpServerState) => boolean,
  reconnect: (name: string) => Promise<void>,
): Promise<void> {
  for (const server of servers) {
    if (!server.config.enabled || !isOAuth(server.config.parameters)) continue
    try {
      await prepare?.(server.config.parameters)
      if (!ready(server)) await reconnect(server.name)
    } catch {
      /* Missing or expired credentials remain unavailable until explicit login. */
    }
  }
}
