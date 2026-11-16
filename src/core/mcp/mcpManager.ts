import isEqual from 'lodash.isequal'
import { Platform } from 'obsidian'

import {
  AuthorizedExecution,
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueExternalCallPermit,
} from '../../security/promptInjectionBoundary'
import { VerbexSettings } from '../../settings/schema/setting.types'
import {
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpTool,
} from '../../types/mcp.types'
import {
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'

import {
  McpSecretReader,
  mcpCredentialConfigHash,
  mcpCredentialMatches,
} from './credentials'
import { mcpEnvironment } from './environment'
import { McpNotAvailableException } from './exception'
import { invokeMcpTool } from './mcpInvocation'
import * as managerText from './mcpManagerText'
import { prepareOAuthConnections } from './oauthReadiness'
import { openPreparedMcpConnection } from './preparedConnection'
import {
  MCP_TOOL_NAME_DELIMITER,
  getToolName,
  parseToolName,
  validateServerName,
} from './tool-name-utils'
import {
  McpAgentEntry,
  McpToolIdentity,
  freezeMcpValue,
  loadMcpToolPages,
  mcpNameSupported,
} from './toolCatalog'
import { mcpResultText } from './toolResult'

export class McpManager {
  static readonly TOOL_NAME_DELIMITER = MCP_TOOL_NAME_DELIMITER

  public readonly disabled = !Platform.isDesktop // MCP should be disabled on mobile since it doesn't support node.js

  private settings: VerbexSettings
  private unsubscribeFromSettings: () => void
  private defaultEnv: Record<string, string>
  private connectionGenerations = new Map<string, number>()
  private updateGeneration = 0
  private disposed = false
  private toolRefreshGenerations = new Map<string, number>()
  private connectionCredentials = new Map<string, string>()
  private readSecret?: McpSecretReader
  private prepareCredentials?: (
    parameters: McpServerConfig['parameters'],
  ) => Promise<void>

  private servers: McpServerState[] = [] // IMPORTANT: Always use this.updateServers() to update this array
  private activeToolCalls: Map<string, AbortController> = new Map()
  private subscribers = new Set<(servers: McpServerState[]) => void>()

  private availableToolsCache: McpTool[] | null = null

  constructor({
    settings,
    registerSettingsListener,
    readSecret,
    prepareCredentials,
  }: {
    settings: VerbexSettings
    readSecret?: McpSecretReader
    prepareCredentials?: (
      parameters: McpServerConfig['parameters'],
    ) => Promise<void>
    registerSettingsListener: (
      listener: (settings: VerbexSettings) => void,
    ) => () => void
  }) {
    this.settings = settings
    this.readSecret = readSecret
    this.prepareCredentials = prepareCredentials
    this.unsubscribeFromSettings = registerSettingsListener((newSettings) => {
      void this.handleSettingsUpdate(newSettings)
    })
  }

  public async initialize() {
    if (this.disabled) {
      return
    }

    this.defaultEnv = mcpEnvironment()

    const generation = ++this.updateGeneration
    const servers = await Promise.all(
      this.settings.mcp.servers.map((serverConfig) =>
        this.connectServer(serverConfig),
      ),
    )
    if (!this.disposed && generation === this.updateGeneration)
      this.updateServers(servers)
    else
      void Promise.all(
        servers.map((server) =>
          server.status === McpServerStatus.Connected
            ? server.client.close()
            : Promise.resolve(),
        ),
      )
  }

  public cleanup() {
    this.disposed = true
    this.updateGeneration++
    for (const controller of this.activeToolCalls.values()) controller.abort()
    // Disconnect all clients
    void Promise.all(
      this.servers
        .filter((s) => s.status === McpServerStatus.Connected)
        .map((s) => s.client.close()),
    )

    if (this.unsubscribeFromSettings) {
      this.unsubscribeFromSettings()
    }

    this.servers = []
    this.subscribers.clear()
    this.activeToolCalls.clear()
    this.connectionCredentials.clear()
  }

  public getServers() {
    return this.servers
  }

  public isServerReady(server: McpServerState): boolean {
    return (
      server.status === McpServerStatus.Connected &&
      mcpCredentialMatches(
        server.config.parameters,
        this.connectionCredentials.get(server.name),
        this.readSecret,
      )
    )
  }

  public subscribeServersChange(callback: (servers: McpServerState[]) => void) {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  public async reconnectServer(name: string): Promise<void> {
    const config = this.settings.mcp.servers.find(
      (server) => server.id === name,
    )
    if (!config || !config.enabled || this.disposed || this.disabled) return
    this.updateServers((servers) =>
      servers.map((server) =>
        server.name === name
          ? { name, config, status: McpServerStatus.Connecting }
          : server,
      ),
    )
    const pending = this.connectServer(config)
    const generation = this.connectionGenerations.get(name)
    const server = await pending
    if (
      this.disposed ||
      generation !== this.connectionGenerations.get(name) ||
      !isEqual(
        this.settings.mcp.servers.find((entry) => entry.id === name),
        config,
      )
    ) {
      if (server.status === McpServerStatus.Connected)
        void server.client.close()
      return
    }
    this.updateServers((servers) =>
      servers.map((previous) => (previous.name === name ? server : previous)),
    )
  }

  public async handleSettingsUpdate(settings: VerbexSettings) {
    if (this.disposed || this.disabled) return
    const generation = ++this.updateGeneration
    this.settings = settings
    const updatedServers = settings.mcp.servers.map(
      (serverConfig: McpServerConfig): McpServerState => {
        const existingServer = this.servers.find(
          (s) => s.name === serverConfig.id,
        )
        if (
          existingServer &&
          isEqual(existingServer.config.parameters, serverConfig.parameters) &&
          existingServer.config.enabled === serverConfig.enabled
        ) {
          // Server is already up to date
          return {
            ...existingServer,
            config: serverConfig,
          }
        }
        return {
          name: serverConfig.id,
          config: serverConfig,
          status: McpServerStatus.Connecting,
        }
      },
    )

    this.updateServers(updatedServers)

    await Promise.all(
      updatedServers
        .filter((s) => s.status === McpServerStatus.Connecting)
        .map(async (s) => {
          const server = await this.connectServer(s.config)
          if (this.disposed || generation !== this.updateGeneration) {
            if (server.status === McpServerStatus.Connected)
              void server.client.close()
            return
          }
          this.updateServers((prevServers) =>
            prevServers.map((prevServer) =>
              prevServer.name === server.name ? server : prevServer,
            ),
          )
        }),
    )
  }

  private notifySubscribers() {
    for (const cb of this.subscribers) cb(this.servers)
  }

  private updateServers(
    newServersOrUpdater?:
      | McpServerState[]
      | ((prevServers: McpServerState[]) => McpServerState[]),
  ) {
    const currentServers = this.servers
    const nextServers =
      typeof newServersOrUpdater === 'function'
        ? newServersOrUpdater(currentServers)
        : (newServersOrUpdater ?? currentServers)

    // Find clients that need to be disconnected
    const clientsToDisconnect = currentServers
      .filter((server) => server.status === McpServerStatus.Connected)
      .map((server) => server.client)
      .filter(
        (client) =>
          !nextServers.some(
            (server) =>
              server.status === McpServerStatus.Connected &&
              server.client === client,
          ),
      )

    // Disconnect clients in the background
    if (clientsToDisconnect.length > 0) {
      void Promise.all(clientsToDisconnect.map((client) => client.close()))
    }

    this.servers = nextServers
    this.availableToolsCache = null // Invalidate available tools cache
    this.notifySubscribers() // Should call after invalidating the cache
  }

  private async connectServer(
    serverConfig: McpServerConfig,
  ): Promise<McpServerState> {
    if (this.disabled) {
      throw new McpNotAvailableException()
    }

    const { id: name, parameters: serverParams, enabled } = serverConfig
    this.connectionGenerations.set(
      name,
      (this.connectionGenerations.get(name) ?? 0) + 1,
    )
    const generation = this.connectionGenerations.get(name)

    if (!enabled) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Disconnected,
      }
    }

    try {
      validateServerName(name)
    } catch (error) {
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: error as Error,
      }
    }

    let client: import('../../types/mcp.types').McpClient | undefined
    try {
      const connection = await openPreparedMcpConnection(
        serverParams,
        this.defaultEnv,
        this.readSecret,
        this.settings.verbex.permissions.allowExternalApi
          ? this.prepareCredentials
          : undefined,
        () =>
          !this.disposed && generation === this.connectionGenerations.get(name),
      )
      const { credential } = connection
      client = connection.client
      const tools = connection.tools
      if (credential) this.connectionCredentials.set(name, credential)
      else this.connectionCredentials.delete(name)
      client.setNotificationHandler('notifications/tools/list_changed', () =>
        this.refreshServerTools(name, connection.client),
      )
      client.onclose = () => {
        if (this.disposed) return
        this.updateServers((servers) =>
          servers.map((server) =>
            server.status === McpServerStatus.Connected &&
            server.client === client
              ? {
                  name,
                  config: server.config,
                  status: McpServerStatus.Disconnected,
                }
              : server,
          ),
        )
      }
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Connected,
        client,
        tools: freezeMcpValue(tools),
      }
    } catch (error) {
      void client?.close()
      return {
        name,
        config: serverConfig,
        status: McpServerStatus.Error,
        error: new Error(
          `Failed to connect/list MCP server ${name}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      }
    }
  }

  public async listAvailableTools(): Promise<McpTool[]> {
    if (this.disabled) {
      return []
    }

    if (this.availableToolsCache) {
      return [...this.availableToolsCache]
    }

    const availableTools = this.servers.flatMap((server): McpTool[] => {
      if (server.status !== McpServerStatus.Connected || !server.config.enabled)
        return []
      return server.tools
        .filter((tool) => !server.config.toolOptions[tool.name]?.disabled)
        .map((tool) => ({
          ...tool,
          name: getToolName(server.name, tool.name),
        }))
    })

    this.availableToolsCache = [...availableTools]
    return [...availableTools]
  }

  private async refreshServerTools(
    name: string,
    client: import('../../types/mcp.types').McpClient,
  ) {
    const generation = (this.toolRefreshGenerations.get(name) ?? 0) + 1
    this.toolRefreshGenerations.set(name, generation)
    this.updateServers((servers) =>
      servers.map((server) =>
        server.status === McpServerStatus.Connected && server.client === client
          ? { ...server, tools: [] }
          : server,
      ),
    )
    try {
      const tools = freezeMcpValue(await loadMcpToolPages(client))
      if (this.disposed || this.toolRefreshGenerations.get(name) !== generation)
        return
      this.updateServers((servers) =>
        servers.map((server) =>
          server.status === McpServerStatus.Connected &&
          server.client === client
            ? { ...server, tools }
            : server,
        ),
      )
    } catch {
      if (this.disposed || this.toolRefreshGenerations.get(name) !== generation)
        return
      this.updateServers((servers) =>
        servers.map((server) =>
          server.status === McpServerStatus.Connected &&
          server.client === client
            ? {
                name,
                config: server.config,
                status: McpServerStatus.Error,
                error: new Error(managerText.refreshFailed()),
              }
            : server,
        ),
      )
    }
  }

  public async getAgentEntries(): Promise<McpAgentEntry[]> {
    if (
      this.disabled ||
      this.disposed ||
      !this.settings.verbex.permissions.allowExternalApi
    )
      return []
    await prepareOAuthConnections(
      this.servers,
      this.prepareCredentials,
      (server) => this.isServerReady(server),
      (name) => this.reconnectServer(name),
    )
    const entries: McpAgentEntry[] = []
    for (const server of this.servers) {
      if (server.status !== McpServerStatus.Connected || !server.config.enabled)
        continue
      for (const tool of server.tools) {
        const name = getToolName(server.name, tool.name)
        if (
          server.config.toolOptions[tool.name]?.disabled ||
          !mcpNameSupported(name)
        )
          continue
        const identity = await this.getToolIdentity(name)
        if (
          !identity ||
          this.servers.find((candidate) => candidate.name === server.name) !==
            server
        )
          continue
        entries.push(
          freezeMcpValue({
            name,
            serverName: server.name,
            tool,
            identity,
            definition: {
              type: 'function',
              function: {
                name,
                description: managerText.toolDescription(server.name, tool),
                parameters:
                  tool.inputSchema as McpAgentEntry['definition']['function']['parameters'],
              },
            },
          }),
        )
      }
    }
    return entries
  }

  public async getToolIdentity(
    name: string,
  ): Promise<McpToolIdentity | undefined> {
    if (
      this.disabled ||
      this.disposed ||
      !this.settings.verbex.permissions.allowExternalApi
    )
      return undefined
    const { serverName, toolName } = parseToolName(name)
    const server = this.servers.find(
      (candidate) => candidate.name === serverName,
    )
    if (
      server?.status !== McpServerStatus.Connected ||
      !server.config.enabled ||
      server.config.toolOptions[toolName]?.disabled
    )
      return undefined
    const tool = server.tools.find((candidate) => candidate.name === toolName)
    if (!tool) return undefined
    const credential = this.connectionCredentials.get(serverName)
    if (!this.isServerReady(server)) return undefined
    const connectionGeneration = this.connectionGenerations.get(serverName) ?? 0
    const identity = Object.freeze({
      serverConfigHash: await mcpCredentialConfigHash(
        server.config.parameters,
        credential,
      ),
      connectionGeneration,
      toolSchemaHash: await canonicalDigest(tool),
    })
    if (
      this.servers.find((candidate) => candidate.name === serverName) !==
        server ||
      connectionGeneration !== this.connectionGenerations.get(serverName) ||
      !this.isServerReady(server)
    )
      return undefined
    return identity
  }

  public automaticApprovalMatches(
    name: string,
    identity: McpToolIdentity,
  ): boolean {
    const { serverName, toolName } = parseToolName(name)
    const option = this.servers.find((server) => server.name === serverName)
      ?.config.toolOptions[toolName]
    return Boolean(
      option?.allowAutoExecution &&
        option.autoApproval?.serverConfigHash === identity.serverConfigHash &&
        option.autoApproval.toolSchemaHash === identity.toolSchemaHash,
    )
  }

  public async callTool({
    name,
    args,
    id,
    signal,
    authorization,
    executionContext,
    automatic = false,
  }: {
    name: string
    args?: Record<string, unknown> | string | undefined
    id?: string
    signal?: AbortSignal
    authorization?: AuthorizedExecution
    executionContext?: { runId: string; turnId: string }
    automatic?: boolean
  }): Promise<
    Extract<
      ToolCallResponse,
      {
        status:
          | ToolCallResponseStatus.Success
          | ToolCallResponseStatus.Error
          | ToolCallResponseStatus.Aborted
      }
    >
  > {
    const toolAbortController = new AbortController()
    if (id !== undefined) {
      const existingAbortController = this.activeToolCalls.get(id)
      if (existingAbortController) {
        existingAbortController.abort()
      }
      this.activeToolCalls.set(id, toolAbortController)
    }
    const compositeSignal = toolAbortController.signal
    const abort = () => toolAbortController.abort()
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })

    try {
      const { serverName, toolName } = parseToolName(name)
      if (!this.settings.verbex.permissions.allowExternalApi)
        throw new Error(managerText.externalDisabled())

      const inputArgs: unknown =
        typeof args === 'string'
          ? args === ''
            ? {}
            : JSON.parse(args)
          : (args ?? {})
      if (
        !inputArgs ||
        typeof inputArgs !== 'object' ||
        Array.isArray(inputArgs)
      )
        throw new Error('MCP arguments must be an object.')
      const serializedArgs = JSON.stringify(inputArgs)
      if (new TextEncoder().encode(serializedArgs).byteLength > 65_536)
        throw new Error('MCP arguments exceed the host limit.')
      const parsedArgs = freezeMcpValue(
        JSON.parse(serializedArgs) as Record<string, unknown>,
      )
      if (compositeSignal.aborted || this.disposed)
        return { status: ToolCallResponseStatus.Aborted }

      if (
        !authorization ||
        authorization.phase !== 'external_call' ||
        !executionContext
      ) {
        return {
          status: ToolCallResponseStatus.Error,
          error: 'Tool execution requires a one-shot exact user permit.',
        }
      }
      if (this.disabled) {
        throw new McpNotAvailableException()
      }

      const server = this.servers.find((server) => server.name === serverName)
      if (!server) {
        throw new Error(`MCP server ${serverName} not found`)
      }
      if (server.status !== McpServerStatus.Connected) {
        throw new Error(`MCP server ${serverName} is not connected`)
      }
      const { client } = server
      const identity = await this.getToolIdentity(name)
      const descriptor = authorization.descriptor
      if (
        !identity ||
        descriptor.serverConfigHash !== identity.serverConfigHash ||
        descriptor.connectionGeneration !== identity.connectionGeneration ||
        descriptor.toolSchemaHash !== identity.toolSchemaHash
      )
        throw new Error(
          'MCP server or tool changed after authorization. Request approval again.',
        )
      await assertExternalCallMatches(authorization, {
        name,
        args: parsedArgs,
        destination: serverName,
        effect: 'networkEgress',
        providerIdentity: identity,
      })
      if (
        compositeSignal.aborted ||
        this.disposed ||
        this.servers.find((candidate) => candidate.name === serverName) !==
          server
      )
        return { status: ToolCallResponseStatus.Aborted }
      if (automatic && !this.automaticApprovalMatches(name, identity))
        throw new Error(managerText.approvalRevoked())
      consumeAuthorizedExecution(authorization, executionContext)
      const result = await invokeMcpTool(
        client,
        { name: toolName, arguments: parsedArgs },
        toolAbortController,
      )
      const text = mcpResultText(result)
      if (result.isError) {
        return {
          status: ToolCallResponseStatus.Error,
          error: text,
        }
      }
      return {
        status: ToolCallResponseStatus.Success,
        data: {
          type: 'text',
          text,
        },
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'McpTimeoutError')
        return { status: ToolCallResponseStatus.Error, error: error.message }
      if (
        compositeSignal.aborted ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        return {
          status: ToolCallResponseStatus.Aborted,
        }
      }

      // Handle other errors
      return {
        status: ToolCallResponseStatus.Error,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }
    } finally {
      signal?.removeEventListener('abort', abort)
      if (
        id !== undefined &&
        this.activeToolCalls.get(id) === toolAbortController
      ) {
        this.activeToolCalls.delete(id)
      }
    }
  }

  /** Issues an exact, one-shot permit for the final MCP sink. */
  public async issueToolPermit(input: {
    name: string
    args?: Record<string, unknown> | string
    runId: string
    turnId: string
  }): Promise<AuthorizedExecution> {
    input = structuredClone(input)
    const { serverName, toolName } = parseToolName(input.name)
    const identity = await this.getToolIdentity(input.name)
    if (!identity) throw new Error(`MCP tool ${toolName} is not available.`)
    const args: unknown =
      typeof input.args === 'string'
        ? input.args === ''
          ? {}
          : JSON.parse(input.args)
        : (input.args ?? {})
    return issueExternalCallPermit({
      name: input.name,
      args,
      runId: input.runId,
      turnId: input.turnId,
      ...identity,
      destination: serverName,
    })
  }

  public abortToolCall(id: string): boolean {
    if (this.disabled) {
      return false
    }
    const toolAbortController = this.activeToolCalls.get(id)
    if (toolAbortController) {
      toolAbortController.abort()
      this.activeToolCalls.delete(id)
      return true
    }
    return false
  }
}
