import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { OwnershipUnverifiableError } from '../ownershipTypes'

import {
  type PluginInstance,
  type ProviderHandle,
  readProviderHandle,
} from './discovery'
import type { Discovered, NativeProviderStatus } from './hostScanTypes'
import type { NativeProviderApproval } from './protocol'
import type { ProviderRuntimeState } from './providerRuntimeState'

type HostBlock = NonNullable<AgentToolOutcome['hostBlock']>
export type HostBlockState = {
  approvals: readonly NativeProviderApproval[]
  statuses: readonly NativeProviderStatus[]
  discovered: ReadonlyMap<string, Discovered>
  plugins: PluginInstance[]
  runtime: ProviderRuntimeState
  policyRevision?: number
}
const blocks = new WeakMap<OwnershipUnverifiableError, HostBlock>()
const providers = new WeakMap<HostBlock, readonly string[]>()

/** Error provenance stays on the host; never infer it from result wording. */
export function ownershipHostBlock(
  error: unknown,
): Pick<AgentToolOutcome, 'hostBlock'> {
  return error instanceof OwnershipUnverifiableError
    ? { hostBlock: blocks.get(error) }
    : {}
}

/** One key function serves both the failure and the next pre-invocation check. */
export class OwnershipBlockState {
  private readonly ids = new WeakMap<object, number>()
  private sequence = 0
  constructor(private readonly read: () => HostBlockState) {}

  private id(value?: object): number | null {
    if (!value) return null
    let id = this.ids.get(value)
    if (!id) this.ids.set(value, (id = ++this.sequence))
    return id
  }

  private handle(handle?: ProviderHandle) {
    if (!handle) return null
    // Include every identity compared by providerInstanceCurrent, including v2.
    return {
      pluginVersion: handle.pluginVersion,
      protocolVersion: handle.protocolVersion,
      identities: [
        handle.plugin,
        handle.provider,
        handle.describe,
        handle.callTool,
        handle.resolveTarget,
        handle.editor?.receiver,
        handle.commit?.receiver,
        handle.commit?.prepare,
        handle.commit?.execute,
        handle.commit?.status,
        handle.editor?.reveal,
        handle.editor?.capture,
        handle.editor?.openDocuments,
        handle.editor?.discardAgentChanges,
        handle.editor?.release,
        handle.browser?.receiver,
        handle.browser?.captureContext,
        handle.browser?.rejectPrepared,
        handle.browser?.resolveTarget,
        handle.browser?.prepare,
        handle.browser?.execute,
        handle.browser?.status,
      ].map((value) => this.id(value)),
    }
  }

  async key(providerIds: readonly string[]): Promise<string> {
    const state = this.read()
    return canonicalDigest({
      policyRevision: state.policyRevision ?? null,
      providers: [...new Set(providerIds)].sort().map((providerId) => {
        const found = state.discovered.get(providerId)
        const plugin = state.plugins.find((item) => item.id === providerId)
        let live: ProviderHandle | undefined
        try {
          live = plugin && readProviderHandle(plugin)
        } catch {
          /* invalid live handle */
        }
        return {
          providerId,
          approvals: state.approvals
            .filter((item) => item.providerId === providerId)
            .map((item) => ({
              enabled: item.enabled,
              approvedDescriptorDigest: item.approvedDescriptorDigest,
              approvedPluginVersion: item.approvedPluginVersion,
              approvedProtocolVersion: item.approvedProtocolVersion,
              approvedArtifactSha256: item.approvedArtifactSha256 ?? null,
              disabledToolNames: [...item.disabledToolNames].sort(),
            })),
          statuses: state.statuses
            .filter((item) => item.providerId === providerId)
            .map(({ state, message }) => ({ state, message })),
          generation: found?.generation ?? null,
          discoveredHandle: this.handle(found?.handle),
          livePlugin: this.id(plugin?.instance),
          livePluginVersion: plugin?.version ?? null,
          liveHandle: this.handle(live),
          runtimeFault: !!(
            (found && state.runtime.fault(found.handle)) ||
            (live && state.runtime.fault(live))
          ),
        }
      }),
    })
  }

  async assertOwnership(
    action: () => Promise<void>,
    writer: string,
  ): Promise<void> {
    try {
      await action()
    } catch (error) {
      if (error instanceof OwnershipUnverifiableError) {
        const ids = [
          writer,
          ...error.unverifiable.map((item) => item.providerId),
        ]
        const block: HostBlock = {
          code: error.code,
          stateKey: await this.key(ids),
        }
        providers.set(block, ids)
        blocks.set(error, block)
      }
      throw error
    }
  }

  providerIds(block: HostBlock): readonly string[] | undefined {
    return providers.get(block)
  }
}
