import type { App } from 'obsidian'

import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import { t } from '../../i18n'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import type { ProviderExecutionContext } from '../ProviderRegistry'

import {
  type ReviewedProvider,
  approveReviewedBatch,
  copyReviews,
} from './batchApproval'
import { type BrowserSelection, captureBrowserContext } from './browserContext'
import { privateBrowserResult } from './browserTranscript'
import { type CommitFact, checkCommitStatus } from './commitStatus'
import { currentProviderCause } from './currentProvider'
import { DESCRIPTOR_LIMITS, copyJson, deepFreeze } from './descriptorReader'
import { parseDescriptor } from './descriptorSchema'
import { type DiagnosticSpan, InteropDiagnostics } from './diagnostics'
import {
  PluginInstance,
  ProviderHandle,
  listEnabledPluginInstances,
  readProviderHandle,
} from './discovery'
import { DESCRIBE_CONCURRENCY } from './discoveryBudget'
import { DiscoveryLifecycle, withTimeout } from './discoveryLifecycle'
import {
  HostContext,
  discardAgentDocumentChanges,
  releaseAgentDocuments,
  revealEditorEdit,
  undoEditorEdit,
} from './editorActions'
import { revokeEditorGrant } from './editorLifecycle'
import { HostBlockGuard } from './hostBlockGuard'
import { OwnershipBlockState } from './hostBlockState'
import { hostDocumentQuery } from './hostDocumentQuery'
import type { NativeHostOptions } from './hostOptions'
import {
  type Discovered,
  type NativeProviderState,
  type NativeProviderStatus,
  type NativeToolEntry,
  scanEnabledProviders,
} from './hostScan'
import {
  type ReviewedInitialProvider,
  approveReviewedInitialProvider,
} from './initialBatchApproval'
import { executeNativeCall } from './nativeExecution'
import { NATIVE_TOOL_PREFIX, NativeProviderApproval } from './protocol'
import {
  approveReviewedProvider,
  providerEntries,
  providerInstructions,
  providerStatuses,
} from './providerApproval'
import { ProviderRuntimeState } from './providerRuntimeState'
import { type SessionGrant, SessionGrantStore } from './sessionGrants'
import type { DocumentRef, SessionEditFact } from './sessionProtocol'
import { EditorCandidate, editorCandidate } from './turnScope'
export type {
  Discovered,
  NativeProviderState,
  NativeProviderStatus,
  NativeToolEntry,
}

export type { NativeHostOptions } from './hostOptions'

/** Discovery, exposure and execution are separate approval boundaries. */
export class NativeProviderHost {
  private readonly runtimeState = new ProviderRuntimeState()
  private readonly describing = new WeakMap<object, Promise<unknown>>()
  private pendingDescriptions = 0
  private readonly busy = new Set<string>()
  readonly diagnostics = new InteropDiagnostics()
  readonly grants = new SessionGrantStore(this.diagnostics)
  readonly activeConversations = new Set<string>()
  private discovered = new Map<string, Discovered>()
  private entries = new Map<string, NativeToolEntry>()
  private statuses: NativeProviderStatus[] = []
  private readonly statusListeners = new Set<() => void>()
  private disposed = false
  private readonly lifecycle: DiscoveryLifecycle
  readonly blockState = new OwnershipBlockState(() => ({
    approvals: this.getApprovals(),
    statuses: this.statuses,
    discovered: this.discovered,
    plugins: (this.options.list ?? listEnabledPluginInstances)(this.app),
    runtime: this.runtimeState,
    policyRevision: this.options.commitPolicy?.().revision,
  }))
  private readonly blockGuard = new HostBlockGuard(this.blockState)

  private app: App
  private getApprovals: () => readonly NativeProviderApproval[]
  readonly options: NativeHostOptions

  constructor(
    app: App,
    getApprovals: () => readonly NativeProviderApproval[],
    options: NativeHostOptions = {},
  ) {
    this.app = app
    this.getApprovals = getApprovals
    this.options = options
    this.lifecycle = new DiscoveryLifecycle(app.workspace, () =>
      this.diagnostics.measure('discovery', {}, () => this.scan()),
    )
  }

  refresh(signal?: AbortSignal): Promise<void> {
    return this.lifecycle.refresh(signal)
  }
  onReady(listener: () => void): () => void {
    return this.lifecycle.onReady(listener)
  }
  onStatusesChanged(listener: () => void): () => void {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private async discover(
    plugin: PluginInstance,
  ): Promise<Discovered | undefined> {
    const handle = readProviderHandle(plugin)
    if (!handle) return undefined
    const fault = this.runtimeState.fault(handle)
    if (fault) throw new Error(fault)
    let pending = this.describing.get(handle.provider)
    if (!pending) {
      if (this.pendingDescriptions >= DESCRIBE_CONCURRENCY)
        throw new Error(t('nativeProviderR10.describeBusy'))
      this.pendingDescriptions++
      pending = Promise.resolve().then(() =>
        Reflect.apply(handle.describe, handle.provider, []),
      )
      this.describing.set(handle.provider, pending)
      const clear = () => {
        this.pendingDescriptions--
        if (this.describing.get(handle.provider) === pending)
          this.describing.delete(handle.provider)
      }
      pending.then(clear, clear)
    }
    const raw = await withTimeout(
      pending,
      this.options.describeTimeoutMs ?? 1000,
      t('nativeProviderR10.describeTimeout'),
    )
    const copy = copyJson(raw, DESCRIPTOR_LIMITS)
    const descriptor = deepFreeze(
      parseDescriptor(copy, {
        pluginId: plugin.id,
        resolveTarget: handle.hasResolveTarget,
        commit: handle.hasCommit,
        protocolVersion: handle.protocolVersion,
        browser: !!handle.browser,
      }),
    )
    return {
      handle,
      descriptor,
      descriptorJson: JSON.stringify(copy),
      digest: await canonicalDigest(copy),
      generation: this.runtimeState.id(handle.provider),
    }
  }

  private async scan(): Promise<void> {
    if (this.disposed) return
    const { discovered, entries, statuses } = await scanEnabledProviders({
      app: this.app,
      selfId: this.options.selfId,
      list: this.options.list,
      refreshBudgetMs: this.options.refreshBudgetMs,
      browserEffects:
        !!this.options.browserRuntime &&
        this.options.browserEffects?.() === true,
      commitPolicy: this.options.commitPolicy?.(),
      commitEffects: this.options.commitEffects,
      sessionEffects: this.options.sessionEffects,
      approvals: this.getApprovals(),
      busy: this.busy,
      runtimeState: this.runtimeState,
      discover: (plugin) => this.discover(plugin),
    })
    if (this.disposed) return
    this.discovered = discovered
    this.entries = entries
    this.statuses = statuses
    for (const listener of this.statusListeners) {
      try {
        listener()
      } catch {
        console.warn('[Verbex] Provider status listener failed')
      }
    }
  }

  getEntries(): NativeToolEntry[] {
    return providerEntries(
      this.entries,
      this.discovered,
      this.runtimeState,
      this.statuses,
      this.getApprovals(),
    )
  }
  getStatuses(): NativeProviderStatus[] {
    return providerStatuses(
      this.statuses,
      this.discovered,
      this.runtimeState,
      (this.options.list ?? listEnabledPluginInstances)(this.app),
      (found) => this.currentCause(found),
    )
  }
  getExposureApprovals(): readonly NativeProviderApproval[] {
    return this.getApprovals()
  }
  hasTool(name: string): boolean {
    return name.startsWith(NATIVE_TOOL_PREFIX)
  }
  changesState(name: string): boolean {
    return ['session', 'commit', 'browser'].includes(
      this.entries.get(name)?.tool.effect ?? '',
    )
  }
  editors(): EditorCandidate[] {
    return [...this.discovered.values()]
      .filter((found) => this.isCurrent(found))
      .flatMap((found) =>
        editorCandidate(found, () => this.busy.has(found.handle.pluginId)),
      )
  }
  browserContext(conversationId: string, selection?: BrowserSelection) {
    return captureBrowserContext(
      this.hostContext(),
      this.getEntries(),
      conversationId,
      selection,
    )
  }
  hostContext(): HostContext {
    return {
      app: this.app,
      selfId: this.options.selfId ?? 'verbex',
      busy: this.busy,
      vaultPath: this.options.vaultPath ?? ((path) => path),
      diagnostics: this.diagnostics,
      refresh: (signal) => this.refresh(signal),
      getActiveDiscovered: (id) => this.discovered.get(id),
      isCurrent: (id, toolName) => {
        const found = this.discovered.get(id)
        return !!found && this.isCurrent(found, toolName)
      },
      currentProviderCause: (id) => {
        const found = this.discovered.get(id)
        return found ? this.currentCause(found) : 'instance_changed'
      },
      reportProviderFault: (handle) => this.runtimeState.block(handle),
      callTimeoutMs: this.options.callTimeoutMs,
      resolveTimeoutMs: this.options.resolveTimeoutMs,
    }
  }
  /** Human click only; navigation never grants editing permission. */
  checkCommit(fact: CommitFact, conversationId: string) {
    return checkCommitStatus(
      this.hostContext(),
      this.options.commitRuntime,
      fact,
      conversationId,
    )
  }
  revealEdit(fact: SessionEditFact, conversationId: string) {
    return revealEditorEdit(this.hostContext(), fact, conversationId)
  }
  /** Human click only: undoes the last AI edit for this conversation. */
  undoEdit(fact: SessionEditFact, conversationId: string) {
    return undoEditorEdit(this.hostContext(), fact, conversationId)
  }
  revokeGrant(grant: SessionGrant) {
    return revokeEditorGrant(this.hostContext(), this.grants, grant)
  }
  readonly openDocuments = hostDocumentQuery(
    () => this.hostContext(),
    () => [...this.discovered.keys()],
    this.activeConversations,
  )
  /** Discards agent changes for an offscreen document on person's confirmation. */
  discardAgentChanges(
    target: DocumentRef,
    providerId: string,
    conversationId: string,
  ) {
    return discardAgentDocumentChanges(
      this.hostContext(),
      target,
      providerId,
      conversationId,
    )
  }
  /** Releases editor leases held for a conversation when it ends. */
  async releaseDocuments(conversationId: string, documents?: DocumentRef[]) {
    if (!documents) {
      this.options.outputAnchorCapture?.release(conversationId)
      this.grants.revoke({ conversationId })
      this.activeConversations.delete(conversationId)
    }
    await this.refresh()
    const handles = [...new Set(this.getEntries().map((e) => e.providerId))]
      .map((id) => this.discovered.get(id)?.handle)
      .filter((h): h is ProviderHandle => !!h)
    return releaseAgentDocuments(
      this.hostContext(),
      handles,
      conversationId,
      documents,
    )
  }
  private isCurrent(found: Discovered, name?: string): boolean {
    return this.currentCause(found, name) === undefined
  }
  private currentCause(found: Discovered, name?: string) {
    return currentProviderCause(
      found,
      this.discovered.get(found.handle.pluginId),
      this.getApprovals(),
      this.disposed,
      () => (this.options.list ?? listEnabledPluginInstances)(this.app),
      name,
      this.statuses,
      !!this.runtimeState.fault(found.handle),
    )
  }
  instructionsFor(
    names: readonly string[],
  ): { providerId: string; text: string }[] {
    return providerInstructions(names, this.getEntries(), this.discovered)
  }
  async approve(
    providerId: string,
    reviewedDigest: string,
    reviewedArtifactSha256?: string,
  ): Promise<NativeProviderApproval> {
    await this.refresh()
    return approveReviewedProvider(
      providerId,
      reviewedDigest,
      reviewedArtifactSha256,
      this.discovered.get(providerId),
      this.getApprovals(),
      this.statuses,
    )
  }
  async approveMany(reviews: readonly ReviewedProvider[]) {
    const reviewed = copyReviews(reviews)
    await this.refresh()
    const approvals = this.getApprovals(),
      statuses = this.getStatuses()
    return approveReviewedBatch(reviewed, this.discovered, approvals, statuses)
  }

  async approveInitial(review: ReviewedInitialProvider) {
    const snapshot = { ...review }
    await this.refresh()
    return approveReviewedInitialProvider(
      snapshot,
      this.discovered.get(snapshot.providerId),
      this.getApprovals(),
      this.getStatuses(),
    )
  }

  dispose(): void {
    this.options.outputAnchorCapture?.dispose()
    this.disposed = true
    this.lifecycle.dispose()
    this.statusListeners.clear()
    this.statuses = []
    this.entries.clear()
    this.discovered.clear()
    this.grants.revoke()
  }

  execute(
    name: string,
    inputArgs: Record<string, unknown>,
    ctx: ProviderExecutionContext = {},
  ): Promise<AgentToolOutcome> {
    if (ctx.conversationId) this.activeConversations.add(ctx.conversationId)
    return this.diagnostics.tool(name, ctx, (trace) =>
      privateBrowserResult(
        this.entries.get(name)?.tool,
        this.executeCall(name, inputArgs, ctx, trace),
      ),
    )
  }
  private executeCall(
    name: string,
    inputArgs: Record<string, unknown>,
    ctx: ProviderExecutionContext,
    trace: DiagnosticSpan,
  ): Promise<AgentToolOutcome> {
    return executeNativeCall(
      {
        app: this.app,
        disposed: this.disposed,
        busy: this.busy,
        entries: () => this.entries,
        discovered: () => this.discovered,
        runtimeState: this.runtimeState,
        options: this.options,
        grants: this.grants,
        refresh: (signal) => this.refresh(signal),
        isCurrent: (found, tool) => this.isCurrent(found, tool),
        blockState: this.blockState,
        blockGuard: this.blockGuard,
      },
      name,
      inputArgs,
      ctx,
      trace,
    )
  }
}
