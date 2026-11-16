import type { CallToolResult, Client, Tool } from '@modelcontextprotocol/client'
import { z } from 'zod'

export type McpTool = Tool
export type McpToolCallResult = CallToolResult
export type McpClient = Client

export const mcpStdioParametersSchema = z
  .object({
    transport: z.literal('stdio').optional(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strip()
export const mcpHttpParametersSchema = z
  .object({
    transport: z.literal('http'),
    url: z.string().url(),
    auth: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }).strict(),
      z
        .object({
          type: z.literal('bearer'),
          secretName: z.string().regex(/^[a-z0-9-]+$/),
        })
        .strict(),
      z
        .object({
          type: z.literal('oauth'),
          secretName: z.string().regex(/^verbex-mcp-oauth-[a-z0-9-]+$/),
        })
        .strict(),
    ]),
  })
  .strict()
export const mcpServerParametersSchema = z.union([
  mcpStdioParametersSchema,
  mcpHttpParametersSchema,
])
export type McpServerParameters = z.infer<typeof mcpServerParametersSchema>

export const mcpServerToolOptionsSchema = z.record(
  z.string(),
  z.object({
    disabled: z.boolean().optional(),
    allowAutoExecution: z.boolean().optional(),
    autoApproval: z
      .object({ serverConfigHash: z.string(), toolSchemaHash: z.string() })
      .optional(),
  }),
)

export const mcpServerConfigSchema = z.object({
  id: z.string(),
  parameters: mcpServerParametersSchema,
  enabled: z.boolean(),
  toolOptions: mcpServerToolOptionsSchema,
})
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>

export enum McpServerStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export type McpServerState = {
  name: string
  config: McpServerConfig
} & (
  | {
      status: McpServerStatus.Connecting | McpServerStatus.Disconnected
    }
  | {
      status: McpServerStatus.Connected
      client: McpClient
      tools: McpTool[]
    }
  | {
      status: McpServerStatus.Error
      error: Error
    }
)
