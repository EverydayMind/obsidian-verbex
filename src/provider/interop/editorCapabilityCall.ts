import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
  issueProviderSessionEditPermit,
} from '../../security/promptInjectionBoundary'

import type { ProviderHandle } from './discovery'
import type { HostContext } from './editorActions'
import type { Caller } from './protocol'
import { callProvider } from './providerCall'

let sequence = 0
type Capability = 'openDocuments' | 'discardAgentChanges' | 'release'

export class EditorCapabilityUnavailable extends Error {
  constructor(
    message: string,
    readonly reason: 'approval_unavailable' | 'provider_busy',
  ) {
    super(message)
  }
}

/** Human editor actions use the same identity, permit and actual-completion lock as model calls. */
export async function invokeEditor(
  host: HostContext,
  providerId: string,
  conversationId: string,
  capability: Capability,
  args: Record<string, unknown>,
  invoke: (
    editor: NonNullable<ProviderHandle['editor']>,
    caller: Caller,
    signal: AbortSignal,
  ) => unknown,
): Promise<unknown> {
  const found = host.getActiveDiscovered(providerId)
  if (
    !found ||
    !host.isCurrent(providerId) ||
    !found.handle.editor?.[capability]
  )
    throw new EditorCapabilityUnavailable(
      t('providerR14.editorUnsupported'),
      'approval_unavailable',
    )
  const requestId = `editor:${capability}:${++sequence}`
  const caller: Caller = {
    pluginId: host.selfId,
    conversationId,
    runId: requestId,
    turnId: requestId,
  }
  const name = `plg__${providerId}__editor.${capability}`
  const destination = `plugin://${providerId}/agentinterop`
  const issue =
    capability === 'discardAgentChanges'
      ? issueProviderSessionEditPermit
      : issueLocalPluginCallPermit
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({
      capability: `editor.${capability}`,
      version: 1,
    }),
  }
  const permit = await issue({
    name,
    args,
    runId: requestId,
    turnId: requestId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(permit, {
    name,
    args,
    destination,
    effect:
      capability === 'discardAgentChanges' ? 'externalMutation' : 'vaultRead',
    providerIdentity,
  })
  const changed =
    !host.isCurrent(providerId) ||
    host.getActiveDiscovered(providerId)?.handle.provider !==
      found.handle.provider
  if (changed || host.busy.has(providerId))
    throw new EditorCapabilityUnavailable(
      t('providerR14.editorBusy'),
      changed ? 'approval_unavailable' : 'provider_busy',
    )
  consumeAuthorizedExecution(permit, { runId: requestId, turnId: requestId })
  const { raw } = await callProvider({
    app: host.app,
    busy: host.busy,
    providerId,
    timeoutMs: host.callTimeoutMs ?? 5000,
    invoke: (signal) => invoke(found.handle.editor!, caller, signal),
  })
  if (!host.isCurrent(providerId))
    throw new EditorCapabilityUnavailable(
      t('providerR14.editorChanged'),
      'approval_unavailable',
    )
  return raw
}
