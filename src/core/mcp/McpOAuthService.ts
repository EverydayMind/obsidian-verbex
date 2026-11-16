import type { App } from 'obsidian'

import { nodeProcess } from '../../platform/node/api'
import { runtimeTimers } from '../../platform/runtime'
import type { McpServerParameters } from '../../types/mcp.types'

import { readMcpSecret } from './credentials'
import { mcpHttpFetch, validateMcpUrl } from './httpFetch'
import { OAUTH_LOGIN_TIMEOUT_MS, openOAuthCallback } from './oauthLoopback'
import { McpOAuthProvider } from './oauthProvider'
import * as text from './oauthServiceText'
import {
  OAuthParameters,
  isOAuth,
  oauthNeedsRefresh,
  readOAuthRecord,
} from './oauthStore'

/** Authentication lifecycle is independent of agent execution and never replays tools. */
export class McpOAuthService {
  private controllers = new Map<string, AbortController>()
  private refreshes = new Map<string, Promise<void>>()
  private disposed = false
  constructor(
    private app: App,
    private openBrowser: (url: string) => void,
  ) {}
  private record(parameters: OAuthParameters) {
    return readOAuthRecord(
      readMcpSecret(this.app, parameters.auth.secretName),
      validateMcpUrl(parameters.url).href,
    )
  }
  needsRefresh(parameters: McpServerParameters): boolean {
    return isOAuth(parameters) && oauthNeedsRefresh(this.record(parameters))
  }
  async login(
    parameters: OAuthParameters,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.operation(
      parameters,
      signal,
      async (controller) => {
        const callback = await openOAuthCallback(controller.signal)
        void callback.result.catch(() => controller.abort())
        try {
          const record = this.record(parameters)
          // A new ephemeral callback requires a new DCR registration.
          const provider = this.provider(
            parameters,
            { ...record, clients: {}, tokens: undefined, discovery: undefined },
            callback.url,
            controller.signal,
            (url) => {
              controller.signal.throwIfAborted()
              this.openBrowser(url.href)
            },
            callback.state,
          )
          const { auth } = await import('@modelcontextprotocol/client')
          await auth(provider, {
            serverUrl: parameters.url,
            forceReauthorization: true,
            fetchFn: this.fetch(controller.signal),
          })
          const params = await callback.result
          controller.signal.throwIfAborted()
          await auth(provider, {
            serverUrl: parameters.url,
            authorizationCode: params.get('code') ?? undefined,
            iss: params.get('iss') ?? undefined,
            fetchFn: this.fetch(controller.signal),
          })
          controller.signal.throwIfAborted()
        } finally {
          callback.close()
        }
      },
      OAUTH_LOGIN_TIMEOUT_MS,
    )
  }
  async prepare(parameters: McpServerParameters): Promise<void> {
    if (!isOAuth(parameters) || !this.needsRefresh(parameters)) return
    const name = parameters.auth.secretName
    if (this.refreshes.has(name)) return this.refreshes.get(name)
    const refresh = this.operation(
      parameters,
      undefined,
      async (controller) => {
        const record = this.record(parameters)
        if (!record.tokens?.refresh_token || !record.redirectUrl)
          throw new Error(text.loginRequired())
        const provider = this.provider(
          parameters,
          record,
          record.redirectUrl,
          controller.signal,
          () => {
            throw new Error(text.expired())
          },
        )
        const { auth } = await import('@modelcontextprotocol/client')
        // Rediscover issuer/resource before refreshing; no browser or MCP request retry.
        provider.invalidateCredentials('discovery')
        await auth(provider, {
          serverUrl: parameters.url,
          fetchFn: this.fetch(controller.signal),
        })
        controller.signal.throwIfAborted()
      },
    )
    this.refreshes.set(name, refresh)
    try {
      await refresh
    } finally {
      if (this.refreshes.get(name) === refresh) this.refreshes.delete(name)
    }
  }
  logout(parameters: OAuthParameters): void {
    this.controllers.get(parameters.auth.secretName)?.abort()
    // Only Verbex-owned, resource-bound entries may be cleared; bearer secrets are shared.
    this.record(parameters)
    readMcpSecret(this.app, parameters.auth.secretName)
    this.app.secretStorage.setSecret(parameters.auth.secretName, '')
  }
  dispose(): void {
    this.disposed = true
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }
  private provider(
    parameters: OAuthParameters,
    record: ReturnType<McpOAuthService['record']>,
    redirectUrl: string,
    signal: AbortSignal,
    redirect: (url: URL) => void,
    state?: string,
  ) {
    let previous = readMcpSecret(this.app, parameters.auth.secretName)
    return new McpOAuthProvider(
      record,
      redirectUrl,
      (next) => {
        signal.throwIfAborted()
        if (
          this.disposed ||
          readMcpSecret(this.app, parameters.auth.secretName) !== previous
        )
          throw new Error(text.secretChanged())
        const value = JSON.stringify(next)
        readOAuthRecord(value, validateMcpUrl(parameters.url).href)
        this.app.secretStorage.setSecret(parameters.auth.secretName, value)
        previous = value
      },
      redirect,
      state,
    )
  }
  private fetch(signal: AbortSignal): typeof mcpHttpFetch {
    return (input, init) =>
      mcpHttpFetch(input, {
        ...init,
        signal: AbortSignal.any([signal, new Request(input, init).signal]),
      })
  }
  private async operation(
    parameters: OAuthParameters,
    signal: AbortSignal | undefined,
    action: (controller: AbortController) => Promise<void>,
    timeoutMs = 60_000,
  ): Promise<void> {
    if (this.disposed) throw new Error(text.disposed())
    if (Number(nodeProcess().versions.node.split('.')[0]) < 20)
      throw new Error(text.nodeRequired())
    signal?.throwIfAborted()
    const name = parameters.auth.secretName
    if (this.controllers.has(name)) throw new Error(text.busy())
    const controller = new AbortController()
    this.controllers.set(name, controller)
    const abort = () => controller.abort()
    const timer = runtimeTimers.setTimeout(abort, timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      await action(controller)
    } catch (error) {
      if (controller.signal.aborted) throw new Error(text.cancelled())
      const {
        IssuerMismatchError,
        AuthorizationServerMismatchError,
        RegistrationRejectedError,
        OAuthError,
      } = await import('@modelcontextprotocol/client')
      if (
        error instanceof IssuerMismatchError ||
        error instanceof AuthorizationServerMismatchError
      )
        throw new Error(text.issuerMismatch())
      if (error instanceof RegistrationRejectedError)
        throw new Error(text.registrationRejected())
      if (error instanceof OAuthError)
        throw new Error(text.authorizationFailed())
      throw error
    } finally {
      runtimeTimers.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (this.controllers.get(name) === controller)
        this.controllers.delete(name)
    }
  }
}
