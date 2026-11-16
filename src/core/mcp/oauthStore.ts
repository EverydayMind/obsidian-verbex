import type {
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client'
import { z } from 'zod'

import { L } from '../../i18n/modelText'
import type { McpServerParameters } from '../../types/mcp.types'

export type OAuthParameters = Extract<
  McpServerParameters,
  { transport: 'http' }
> & {
  auth: { type: 'oauth'; secretName: string }
}
export function isOAuth(
  parameters: McpServerParameters,
): parameters is OAuthParameters {
  return parameters.transport === 'http' && parameters.auth.type === 'oauth'
}

export type OAuthRecord = {
  version: 1
  resource: string
  clients: Record<string, StoredOAuthClientInformation>
  tokens?: StoredOAuthTokens
  expiresAt?: number
  discovery?: OAuthDiscoveryState
  redirectUrl?: string
}
const tokenSchema = z
  .object({
    access_token: z
      .string()
      .min(1)
      .max(16384)
      .regex(/^[^\r\n]+$/),
    token_type: z.string().refine((value) => value.toLowerCase() === 'bearer'),
    refresh_token: z.string().optional(),
    expires_in: z.number().nonnegative().optional(),
    issuer: z.url(),
  })
  .loose()
const recordSchema = z.object({
  version: z.literal(1),
  resource: z.url(),
  clients: z.record(
    z.string(),
    z.object({ client_id: z.string().min(1), issuer: z.url() }).loose(),
  ),
  tokens: tokenSchema.optional(),
  expiresAt: z.number().optional(),
  discovery: z.object({ authorizationServerUrl: z.url() }).loose().optional(),
  redirectUrl: z.url().optional(),
})

export function readOAuthRecord(
  raw: string | null,
  resource: string,
): OAuthRecord {
  if (!raw) return { version: 1, resource, clients: {} }
  if (raw.length > 128 * 1024)
    throw new Error(
      L({
        ko: 'OAuth 비밀 항목이 크기 제한을 초과했습니다.',
        en: 'The OAuth secret exceeds the size limit.',
      }),
    )
  const record = recordSchema.parse(JSON.parse(raw)) as OAuthRecord
  if (record.resource !== resource)
    throw new Error(
      L({
        ko: 'OAuth 비밀 항목의 MCP URL이 다릅니다. 새 항목으로 로그인하세요.',
        en: 'The MCP URL in the OAuth secret differs. Log in using a new secret.',
      }),
    )
  if (
    Object.entries(record.clients).some(
      ([issuer, info]) => info.issuer !== issuer,
    )
  )
    throw new Error(
      L({
        ko: 'OAuth 클라이언트 issuer가 일치하지 않습니다.',
        en: 'The OAuth client issuer does not match.',
      }),
    )
  return record
}

export function oauthNeedsRefresh(record: OAuthRecord): boolean {
  return (
    !record.tokens ||
    (record.expiresAt !== undefined && record.expiresAt <= Date.now() + 60_000)
  )
}
