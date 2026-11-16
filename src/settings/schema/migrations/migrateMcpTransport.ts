/** v23 parameters are stdio settings. Preserve IDs, options, args and env. */
export function migrateMcpTransport(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const mcp = data.mcp as Record<string, unknown> | undefined
  if (!Array.isArray(mcp?.servers)) return data
  return {
    ...data,
    mcp: {
      ...mcp,
      servers: mcp.servers.map((value: unknown) => {
        if (!value || typeof value !== 'object') return value
        const server = value as Record<string, unknown>
        const parameters = server.parameters as
          | Record<string, unknown>
          | undefined
        if (!parameters || parameters.transport !== undefined) return server
        return { ...server, parameters: { ...parameters, transport: 'stdio' } }
      }),
    },
  }
}
