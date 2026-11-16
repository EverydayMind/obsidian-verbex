import type { RequestTool } from '../../types/llm/request'
import type { McpClient, McpTool } from '../../types/mcp.types'

export type McpToolIdentity = Readonly<{
  serverConfigHash: string
  connectionGeneration: number
  toolSchemaHash: string
}>
export type McpAgentEntry = Readonly<{
  name: string
  serverName: string
  tool: McpTool
  definition: RequestTool
  identity: McpToolIdentity
}>
export function sameMcpIdentity(
  a: McpToolIdentity | undefined,
  b: McpToolIdentity | undefined,
): boolean {
  return Boolean(
    a &&
      b &&
      a.serverConfigHash === b.serverConfigHash &&
      a.connectionGeneration === b.connectionGeneration &&
      a.toolSchemaHash === b.toolSchemaHash,
  )
}
export function mcpNameSupported(name: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(name)
}
export function freezeMcpValue<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeMcpValue)
    Object.freeze(value)
  }
  return value
}

/** A bad/looping list must not leave a partial, stale catalog callable. */
export async function loadMcpToolPages(client: McpClient): Promise<McpTool[]> {
  const tools: McpTool[] = []
  const names = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  let bytes = 0
  for (let page = 0; page < 100; page++) {
    const result = await client.listTools(cursor ? { cursor } : undefined, {
      cacheMode: 'refresh',
    })
    for (const tool of result.tools) {
      if (names.has(tool.name)) throw new Error('Duplicate MCP tool name.')
      names.add(tool.name)
      bytes += new TextEncoder().encode(JSON.stringify(tool)).byteLength
      if (tools.length >= 1000 || bytes > 1_048_576)
        throw new Error('MCP tool catalog exceeds the host limit.')
      tools.push(tool)
    }
    if (!result.nextCursor) return tools
    if (cursors.has(result.nextCursor))
      throw new Error('MCP tool pagination repeated a cursor.')
    cursors.add(result.nextCursor)
    cursor = result.nextCursor
  }
  throw new Error('MCP tool pagination exceeds the host limit.')
}
