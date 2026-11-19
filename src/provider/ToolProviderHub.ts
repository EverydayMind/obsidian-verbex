import type { App } from 'obsidian'

import type { AgentToolOutcome } from '../core/llm/agentLoop'
import type { ToolResult } from '../core/tools/localToolCommon'
import type { ToolMetadata } from '../core/tools/toolMetadata'
import { nativeToolReady } from '../tools/nativeCatalog'
import type { RequestTool } from '../types/llm/request'

import { PluginConnectorHost } from './connectors/PluginConnectorHost'
import { KORDOC_PROVIDER_ID } from './contract'
import { DocumentOwnershipPolicy } from './DocumentOwnershipPolicy'
import { NativeProviderHost } from './interop/NativeProviderHost'
import {
  type PendingPluginApproval,
  projectPendingPluginApprovals,
  readManifestName,
} from './interop/pendingPluginApprovals'
import { McpToolAdapter } from './mcp/McpToolAdapter'
import {
  ProviderExecutionContext,
  ProviderRegistry,
  ProviderRegistrySnapshot,
} from './ProviderRegistry'

export type ProviderRuntime = Pick<
  ProviderRegistry,
  'getSnapshot' | 'createSnapshot' | 'hasTool' | 'onReady'
> & {
  getAgentToolDefinitions(): RequestTool[]
  executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx?: ProviderExecutionContext,
  ): Promise<ToolResult>
  invalidateRun(runId: string): unknown
  connectors?: PluginConnectorHost
  getToolMetadata?: (name: string) => ToolMetadata | undefined
  nativeToolReady?: (name: string) => boolean
  recordExposure?: (names: string[]) => void
  mcp?: McpToolAdapter
  native?: NativeProviderHost
  pendingPluginApprovals?: () => PendingPluginApproval[]
  executeAgentTool?: (
    name: string,
    args: Record<string, unknown>,
    ctx: ProviderExecutionContext,
  ) => Promise<AgentToolOutcome | undefined>
}

export class ToolProviderHub implements ProviderRuntime {
  readonly ownership: DocumentOwnershipPolicy
  lastExposure?: { names: readonly string[]; timestamp: number }
  recordExposure(names: string[]): void {
    this.lastExposure = {
      names: Object.freeze([...names]),
      timestamp: Date.now(),
    }
  }
  constructor(
    private kordoc: ProviderRegistry,
    readonly connectors: PluginConnectorHost,
    private app?: App,
    readonly mcp?: McpToolAdapter,
    readonly native?: NativeProviderHost,
  ) {
    this.ownership = new DocumentOwnershipPolicy(
      (except, trace) =>
        this.native?.openDocuments('ownership', true, except, trace) ??
        Promise.resolve([]),
      () => this.kordoc.openDocumentPaths(),
      this.native?.diagnostics,
      {
        vault: this.app?.vault,
        providerName: (id) =>
          this.native?.hostContext().getActiveDiscovered(id)?.descriptor
            ?.provider.name,
      },
    )
    this.kordoc.documentOwnership = this.ownership
    if (this.kordoc.binaryPipeline)
      this.kordoc.binaryPipeline.assertOwnership = (path) =>
        this.native
          ? this.native.blockState.assertOwnership(
              () => this.ownership.assertAvailable(path, { kind: 'legacy' }),
              KORDOC_PROVIDER_ID,
            )
          : this.ownership.assertAvailable(path, { kind: 'legacy' })
    const nativeHost = this.native
    if (nativeHost)
      nativeHost.options.assertOwnership = (path, providerId, options) =>
        nativeHost.blockState.assertOwnership(
          () =>
            this.ownership.assertAvailable(
              path,
              { kind: 'native', providerId },
              options,
            ),
          providerId,
        )
  }
  /** Same projection as the system prompt line; never descriptor values. */
  readonly pendingPluginApprovals = (): PendingPluginApproval[] => {
    const app = this.app
    return app && this.native
      ? projectPendingPluginApprovals(this.native.getStatuses(), (id) =>
          readManifestName(app, id),
        )
      : []
  }
  nativeToolReady(name: string): boolean {
    return !this.app || nativeToolReady(this.app, name)
  }
  async getSnapshot(): Promise<ProviderRegistrySnapshot> {
    await this.connectors.refresh()
    await this.kordoc.getSnapshot()
    await this.mcp?.refresh()
    await this.native?.refresh()
    return this.createSnapshot()
  }
  createSnapshot(): ProviderRegistrySnapshot {
    const snapshot = this.kordoc.createSnapshot()
    const entries = this.connectors.getEntries()
    return Object.freeze({
      ...snapshot,
      toolNames: Object.freeze([
        ...snapshot.toolNames,
        ...entries.map((entry) => entry.definition.function.name),
        ...(this.mcp?.getEntries().map((entry) => entry.name) ?? []),
        ...(this.native?.getEntries().map((entry) => entry.name) ?? []),
      ]),
      nativeIdentities: Object.freeze(
        Object.fromEntries(
          (this.native?.getEntries() ?? []).map((entry) => [
            entry.name,
            entry.identity,
          ]),
        ),
      ),
      connectorIdentities: Object.freeze(
        Object.fromEntries(
          entries.map((entry) => [
            entry.definition.function.name,
            entry.identity,
          ]),
        ),
      ),
      mcpIdentities: Object.freeze(
        Object.fromEntries(
          (this.mcp?.getEntries() ?? []).map((entry) => [
            entry.name,
            entry.identity,
          ]),
        ),
      ),
    })
  }
  getAgentToolDefinitions(): RequestTool[] {
    return [
      ...this.kordoc.getAgentToolDefinitions(),
      ...this.connectors.getEntries().map((entry) => entry.definition),
      ...(this.mcp?.getEntries().map((entry) => entry.definition) ?? []),
      ...(this.native?.getEntries().map((entry) => entry.definition) ?? []),
    ]
  }
  hasTool(name: string): boolean {
    return (
      this.connectors.hasTool(name) ||
      this.kordoc.hasTool(name) ||
      this.mcp?.hasTool(name) === true ||
      this.native?.hasTool(name) === true
    )
  }
  async executeAgentTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ProviderExecutionContext,
  ): Promise<AgentToolOutcome | undefined> {
    const release = this.ownership.register(ctx)
    try {
      if (this.native?.hasTool(name))
        return await this.native.execute(name, args, ctx)
      return this.mcp?.hasTool(name) || ctx.snapshot?.mcpIdentities?.[name]
        ? await this.mcp?.execute(name, args, ctx)
        : undefined
    } finally {
      release()
    }
  }
  async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx?: ProviderExecutionContext,
  ): Promise<ToolResult> {
    const release = this.ownership.register(ctx)
    try {
      return await (this.connectors.hasTool(name)
        ? this.connectors.executeTool(name, args, ctx)
        : this.kordoc.executeTool(name, args, ctx))
    } finally {
      release()
    }
  }
  onReady(listener: () => void): () => void {
    const detach = this.kordoc.onReady(listener)
    const detachNative = this.native?.onReady(listener)
    return () => {
      detach()
      detachNative?.()
    }
  }
  invalidateRun(runId: string): void {
    this.ownership.release(runId)
    this.kordoc.invalidateRun(runId)
    this.mcp?.invalidateRun(runId)
  }
  getToolMetadata(name: string): ToolMetadata | undefined {
    if (
      this.native
        ?.getEntries()
        .some(
          (e) =>
            e.name === name &&
            (e.tool.resourceKind === 'browser' || e.tool.effect === 'browser'),
        )
    )
      return {
        category: this.native.changesState(name) ? 'write' : 'read',
        evictable: false,
        privateTranscript: true,
      }
    if (this.native?.hasTool(name))
      return this.native.changesState(name)
        ? { category: 'write', evictable: false }
        : {
            category: 'read',
            evictionKind: 'file_read',
            evidenceRole: 'reading',
          }
    if (this.mcp?.hasTool(name))
      return {
        category: 'write',
        evictable: false,
        historicalResult: 'external_observation',
      }
    if (name === 'kordoc__prepare_block_patch')
      return { category: 'write', evictable: false }
    if (
      name === 'kordoc__inspect_document' ||
      name === 'kordoc__inspect_blocks'
    )
      return {
        category: 'read',
        evictionKind: 'file_read',
        evidenceRole: 'reading',
      }
    const entry = this.connectors
      .getEntries()
      .find((candidate) => candidate.definition.function.name === name)
    const pathArgs = entry?.tool.args.flatMap((arg) =>
      'vaultPath' in arg
        ? [arg.vaultPath]
        : 'vaultFile' in arg
          ? [arg.vaultFile]
          : [],
    )
    return entry
      ? {
          category: 'read',
          evictionKind: 'search_result',
          ...(pathArgs?.length ? { pathArgs } : {}),
          evidenceRole: entry.tool.result.pathField ? 'discovery' : undefined,
        }
      : undefined
  }
}
