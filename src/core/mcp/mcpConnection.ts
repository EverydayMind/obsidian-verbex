import { L } from '../../i18n/modelText'
import type {
  McpClient,
  McpServerParameters,
  McpTool,
} from '../../types/mcp.types'

import { McpSecretReader, resolveMcpToken } from './credentials'

/** Transport setup is separate from catalog/snapshot and execution policy. */
export async function openMcpConnection(
  parameters: McpServerParameters,
  defaultEnv: Record<string, string>,
  readSecret?: McpSecretReader,
  capturedToken?: string,
): Promise<{ client: McpClient; tools: McpTool[] }> {
  if (Number(process.versions.node.split('.')[0]) < 20)
    throw new Error(
      L({
        ko: 'MCP SDK v2는 Node.js 20 이상인 Obsidian 데스크톱이 필요합니다.',
        en: 'MCP SDK v2 requires Obsidian desktop with Node.js 20 or later.',
      }),
    )
  const { Client, StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/client'
  )
  const { StdioClientTransport } = await import(
    '@modelcontextprotocol/client/stdio'
  )
  const { loadMcpToolPages } = await import('./toolCatalog')
  const client = new Client(
    { name: 'Verbex', version: '0.1.0' },
    {
      versionNegotiation: {
        mode: parameters.transport === 'http' ? 'auto' : 'legacy',
      },
      inputRequired: { autoFulfill: false },
      listMaxPages: 100,
    },
  )
  try {
    if (parameters.transport === 'http') {
      const { mcpHttpFetch, validateMcpUrl } = await import('./httpFetch')
      await client.connect(
        new StreamableHTTPClientTransport(validateMcpUrl(parameters.url), {
          fetch: mcpHttpFetch,
          requestInit: { redirect: 'error' },
          ...(parameters.auth.type !== 'none'
            ? {
                authProvider: {
                  token: async () =>
                    capturedToken ?? resolveMcpToken(parameters, readSecret),
                },
              }
            : {}),
          reconnectionOptions: {
            maxRetries: 0,
            initialReconnectionDelay: 1000,
            maxReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1,
          },
        }),
      )
    } else {
      await client.connect(
        new StdioClientTransport({
          ...parameters,
          env: { ...defaultEnv, ...(parameters.env ?? {}) },
        }),
      )
    }
    const tools = await loadMcpToolPages(client)
    return { client, tools }
  } catch (error) {
    void client.close()
    throw error
  }
}
