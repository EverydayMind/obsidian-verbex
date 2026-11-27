import type { AgentToolOutcome } from '../../core/llm/agentLoop'
import {
  toolFailed,
  toolRejected,
  toolSucceeded,
} from '../../core/llm/toolOutcome'
import type { McpManager } from '../../core/mcp/mcpManager'
import {
  McpAgentEntry,
  McpToolIdentity,
  freezeMcpValue,
  sameMcpIdentity,
} from '../../core/mcp/toolCatalog'
import { t } from '../../i18n'
import { L } from '../../i18n/modelText'
import { ToolCallResponseStatus } from '../../types/tool-call.types'
import type { ProviderExecutionContext } from '../providerTurnTypes'

export type McpApprovalRequest = {
  mode: 'call' | 'automatic'
  entry: McpAgentEntry
  args?: Readonly<Record<string, unknown>>
}
export type McpApprovalDecision = 'once' | 'automatic' | 'reject'
export type McpApprovalHandler = (
  request: McpApprovalRequest,
  signal?: AbortSignal,
) => Promise<McpApprovalDecision>

/** Owns approval; the manager owns identity verification at the actual sink. */
export class McpToolAdapter {
  private entries: McpAgentEntry[] = []
  private active = new Map<string, Set<AbortController>>()
  private lifetime = new AbortController()
  constructor(
    private getManager: () => Promise<McpManager>,
    private approve: McpApprovalHandler,
    private saveAutomatic: (
      name: string,
      identity: McpToolIdentity | undefined,
    ) => Promise<void>,
  ) {}
  async refresh(): Promise<void> {
    if (this.lifetime.signal.aborted) return
    const entries = await (await this.getManager()).getAgentEntries()
    if (!this.lifetime.signal.aborted) this.entries = entries
  }
  dispose(): void {
    this.lifetime.abort()
    for (const runId of this.active.keys()) this.invalidateRun(runId)
    this.entries = []
  }
  getEntries(): readonly McpAgentEntry[] {
    return this.entries
  }
  hasTool(name: string): boolean {
    return this.entries.some((entry) => entry.name === name)
  }
  invalidateRun(runId: string): void {
    for (const controller of this.active.get(runId) ?? []) controller.abort()
  }
  async setAutomatic(name: string, enabled: boolean): Promise<boolean> {
    if (this.lifetime.signal.aborted) return false
    if (!enabled) {
      await this.saveAutomatic(name, undefined)
      return true
    }
    await this.refresh()
    const entry = this.entries.find((candidate) => candidate.name === name)
    if (!entry) throw new Error(t('providerR13.mcpUnavailable'))
    const decision = await this.approve(
      { mode: 'automatic', entry },
      this.lifetime.signal,
    )
    if (this.lifetime.signal.aborted) return false
    const manager = await this.getManager()
    if (!sameMcpIdentity(entry.identity, await manager.getToolIdentity(name)))
      throw new Error(t('providerR13.mcpChanged'))
    if (decision !== 'automatic') return false
    await this.saveAutomatic(name, entry.identity)
    return true
  }
  async execute(
    name: string,
    inputArgs: Record<string, unknown>,
    ctx: ProviderExecutionContext = {},
  ): Promise<AgentToolOutcome> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (ctx.signal?.aborted) abort()
    else ctx.signal?.addEventListener('abort', abort, { once: true })
    const runId = ctx.runId ?? 'mcp'
    const active = this.active.get(runId) ?? new Set<AbortController>()
    active.add(controller)
    this.active.set(runId, active)
    const paused = (): AgentToolOutcome => ({
      status: 'paused',
      terminal: true,
      mutation: 'none',
      displayText: L({
        ko: 'MCP 호출을 중단했습니다. 이미 시작된 외부 작업은 완료됐을 수 있으므로 재실행 전에 결과를 확인하세요.',
        en: 'The MCP call was stopped. External work that already started may have completed; check the result before running it again.',
      }),
      retry: { allowed: false },
    })
    try {
      if (controller.signal.aborted || this.lifetime.signal.aborted)
        return paused()
      const serialized = JSON.stringify(inputArgs)
      if (
        !inputArgs ||
        Array.isArray(inputArgs) ||
        new TextEncoder().encode(serialized).byteLength > 65_536
      )
        return toolFailed(
          L({
            ko: 'MCP 인자는 객체여야 하며 64 KiB 이하여야 합니다.',
            en: 'MCP arguments must be an object no larger than 64 KiB.',
          }),
        )
      const args = freezeMcpValue(JSON.parse(serialized)) as Record<
        string,
        unknown
      >
      const entry = this.entries.find((candidate) => candidate.name === name)
      if (
        !entry ||
        !ctx.snapshot?.toolNames.includes(name) ||
        !sameMcpIdentity(ctx.snapshot.mcpIdentities?.[name], entry.identity)
      )
        return toolFailed(
          L({
            ko: 'MCP 도구가 이번 턴 snapshot에 없습니다. 다시 요청하세요.',
            en: "The MCP tool is not in this turn's snapshot. Submit the request again.",
          }),
        )
      const manager = await this.getManager()
      if (controller.signal.aborted) return paused()
      const current = () => manager.getToolIdentity(name)
      if (!sameMcpIdentity(entry.identity, await current()))
        return toolFailed(
          L({
            ko: 'MCP 서버·연결·스키마가 바뀌었습니다. 다시 요청하세요.',
            en: 'The MCP server, connection, or schema changed. Submit the request again.',
          }),
        )
      const automatic = manager.automaticApprovalMatches(name, entry.identity)
      if (!automatic) {
        const decision = await this.approve(
          { mode: 'call', entry, args },
          controller.signal,
        )
        if (controller.signal.aborted) return paused()
        if (decision === 'reject')
          return toolRejected(
            L({
              ko: '사용자가 MCP 호출을 거절했습니다.',
              en: 'The user rejected the MCP call.',
            }),
            {
              retry: { allowed: false },
            },
          )
        if (!sameMcpIdentity(entry.identity, await current()))
          return toolFailed(
            L({
              ko: '승인 대기 중 MCP 대상이 바뀌어 실행하지 않았습니다.',
              en: 'The MCP target changed while approval was pending; the call was not executed.',
            }),
          )
        if (decision === 'automatic')
          await this.saveAutomatic(name, entry.identity)
      }
      if (controller.signal.aborted) return paused()
      if (!sameMcpIdentity(entry.identity, await current()))
        return toolFailed(
          L({
            ko: 'MCP 대상이 바뀌어 실행하지 않았습니다.',
            en: 'The MCP target changed; the call was not executed.',
          }),
        )
      const authorization = await manager.issueToolPermit({
        name,
        args,
        runId,
        turnId: ctx.turnId ?? name,
      })
      if (
        authorization.phase !== 'external_call' ||
        !sameMcpIdentity(entry.identity, authorization.descriptor)
      )
        return toolFailed(
          L({
            ko: 'MCP permit의 대상이 이번 턴과 다릅니다.',
            en: 'The MCP permit target does not match this turn.',
          }),
        )
      const result = await manager.callTool({
        name,
        args,
        id: `${runId}:${ctx.turnId ?? name}`,
        signal: controller.signal,
        authorization,
        executionContext: { runId, turnId: ctx.turnId ?? name },
        automatic,
      })
      if (
        controller.signal.aborted ||
        result.status === ToolCallResponseStatus.Aborted
      )
        return paused()
      const disclosure = {
        connectorId: `mcp/${entry.serverName}`,
        canonicalVaultPaths: [],
        unattributedFiles: 0,
      }
      if (result.status === ToolCallResponseStatus.Error)
        return toolFailed(result.error, {
          retry: { allowed: false },
          disclosure,
        })
      return toolSucceeded(
        L({
          ko: `[MCP 결과: ${name}; 외부 데이터]\n${result.data.text}`,
          en: `[MCP result: ${name}; external data]\n${result.data.text}`,
        }),
        { disclosure },
      )
    } catch (error) {
      if (controller.signal.aborted) return paused()
      return toolFailed(
        error instanceof Error
          ? error.message
          : L({ ko: 'MCP 호출 실패', en: 'MCP call failed' }),
        { retry: { allowed: false } },
      )
    } finally {
      ctx.signal?.removeEventListener('abort', abort)
      active.delete(controller)
      if (active.size === 0) this.active.delete(runId)
    }
  }
}
