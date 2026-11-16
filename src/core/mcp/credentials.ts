import type { App } from 'obsidian'
import { requireApiVersion } from 'obsidian'

import { L } from '../../i18n/modelText'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { McpServerParameters } from '../../types/mcp.types'

import { isOAuth, readOAuthRecord } from './oauthStore'

export type McpSecretReader = (name: string) => string | null

export function readMcpSecret(app: App, name: string): string | null {
  if (!requireApiVersion('1.11.5') || !app.secretStorage?.getSecret)
    throw new Error(
      L({
        ko: 'MCP 토큰은 Obsidian 1.11.5 이상의 Keychain / Secret Storage가 필요합니다.',
        en: 'MCP tokens require Keychain / Secret Storage in Obsidian 1.11.5 or later.',
      }),
    )
  return app.secretStorage.getSecret(name)
}

export function resolveMcpToken(
  parameters: McpServerParameters,
  read?: McpSecretReader,
): string | undefined {
  if (parameters.transport !== 'http' || parameters.auth.type === 'none')
    return undefined
  const raw = read?.(parameters.auth.secretName) ?? null
  const record = isOAuth(parameters)
    ? readOAuthRecord(raw, parameters.url)
    : undefined
  if (record?.expiresAt !== undefined && record.expiresAt <= Date.now())
    throw new Error(
      L({
        ko: 'OAuth 인증이 만료됐습니다. 다시 로그인하거나 연결하세요.',
        en: 'OAuth authorization has expired. Log in or connect again.',
      }),
    )
  const token = record ? record.tokens?.access_token : raw
  if (!token)
    throw new Error(
      isOAuth(parameters)
        ? L({
            ko: 'OAuth 로그인이 필요합니다. MCP 설정에서 로그인하세요.',
            en: 'OAuth login is required. Log in from MCP settings.',
          })
        : L({
            ko: 'Keychain에 MCP 토큰이 없습니다. 비밀 항목을 선택하거나 생성하세요.',
            en: 'No MCP token was found in Keychain. Select or create a secret.',
          }),
    )
  if (token.length > 16_384 || /[\r\n]/.test(token))
    throw new Error(
      L({
        ko: 'MCP 토큰 형식이 올바르지 않습니다.',
        en: 'Invalid MCP token format.',
      }),
    )
  return token
}

export async function mcpConfigHash(
  parameters: McpServerParameters,
  read?: McpSecretReader,
): Promise<string> {
  return mcpCredentialConfigHash(
    parameters,
    resolveMcpCredential(parameters, read),
  )
}

export function resolveMcpCredential(
  parameters: McpServerParameters,
  read?: McpSecretReader,
): string | undefined {
  const token = resolveMcpToken(parameters, read)
  return isOAuth(parameters)
    ? (read?.(parameters.auth.secretName) ?? undefined)
    : token
}

export function mcpCredentialConfigHash(
  parameters: McpServerParameters,
  token?: string,
): Promise<string> {
  return canonicalDigest(
    token === undefined ? parameters : { parameters, token },
  )
}

export function mcpCredentialMatches(
  parameters: McpServerParameters,
  pinned: string | undefined,
  read?: McpSecretReader,
): boolean {
  try {
    return resolveMcpCredential(parameters, read) === pinned
  } catch {
    return false
  }
}
