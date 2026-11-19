import { assertNoAiPrivateArg } from '../../security/aiPrivateRefusal'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import { RESULT_LIMITS, copyJson } from './descriptorReader'
import { copyDocumentJobArgs, validateDocumentJobArgs } from './documentJobArgs'
import type { HostContext } from './editorActions'
import {
  HostReadFailure,
  assertHostReadState,
  hostReadCause,
  rethrowHostReadFailure,
} from './hostReadFailure'
import { nativeToolArgs } from './nativeToolArgs'
import type { JsonObject } from './protocol'
import { callProvider } from './providerCall'
import { readToolResult } from './resultReader'

let sequence = 0
export class HostInternalReadError extends HostReadFailure {
  constructor(
    readonly code: string,
    readonly vaultEvents = 0,
    readonly stale = false,
  ) {
    super('invalid_response')
    this.message = `Read tool failed: ${code}`
  }
}
/** Host validation read: no model tool exposure or body transcript. The caller
 * must validate the returned untrusted structuredContent against its contract. */
export async function hostInternalRead(
  host: HostContext,
  providerId: string,
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<JsonObject> {
  assertNoAiPrivateArg(input)
  await host.refresh(signal)
  const found = host.getActiveDiscovered(providerId)
  const tool = found?.descriptor?.tools.find((item) => item.name === toolName)
  const assertCurrent = (
    beforeCall = false,
    vaultEvents = 0,
    failure?: unknown,
  ) => {
    const latest = host.getActiveDiscovered(providerId)
    const providerCurrent = host.isCurrent(providerId)
    assertHostReadState({
      tool_unavailable:
        !tool ||
        tool.effect !== 'read' ||
        (providerCurrent && !host.isCurrent(providerId, toolName)),
      provider_not_current: !found || !providerCurrent,
      busy: beforeCall && host.busy.has(providerId),
      cancelled: signal?.aborted,
      replaced: latest?.handle.provider !== found?.handle.provider,
      ...(failure ? { [hostReadCause(failure)]: true } : {}),
      stale: latest?.digest !== found?.digest,
      vault_changed: vaultEvents > 0,
    })
  }
  assertCurrent(true)
  if (!found || !tool) throw new HostReadFailure('tool_unavailable')
  const { args, problem } =
    providerId === 'md-to-hwpx' && toolName === 'preview_derived_export'
      ? validateDocumentJobArgs(input, tool)
      : nativeToolArgs(input, tool)
  if (problem) throw new HostReadFailure('invalid_response', problem)
  const requestId = `host-read-${++sequence}`,
    name = `plg__${providerId}__${toolName}`,
    destination = `plugin://${providerId}/agentinterop`
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest(tool.inputSchema),
  }
  const permit = await issueLocalPluginCallPermit({
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
    effect: 'vaultRead',
    providerIdentity,
  })
  assertCurrent(true)
  consumeAuthorizedExecution(permit, { runId: requestId, turnId: requestId })
  const { raw, vaultEvents } = await callProvider({
    app: host.app,
    busy: host.busy,
    providerId,
    signal,
    timeoutMs: host.callTimeoutMs ?? 30000,
    invoke: (callSignal) => {
      assertCurrent()
      return Reflect.apply(found.handle.callTool, found.handle.provider, [
        toolName,
        toolName === 'preview_derived_export'
          ? copyDocumentJobArgs(args)
          : args,
        {
          caller: {
            pluginId: host.selfId,
            conversationId: requestId,
            runId: requestId,
            turnId: requestId,
          },
          requestId,
          signal: callSignal,
          actor: { kind: 'agent', label: 'Verbex host validation' },
        },
      ])
    },
  }).catch((error) =>
    rethrowHostReadFailure(error, (failure) =>
      assertCurrent(false, 0, failure),
    ),
  )
  let structured: JsonObject
  try {
    const result = readToolResult(raw, tool, host.vaultPath)
    if (result.isError)
      throw new HostInternalReadError(
        result.errorCode ?? 'provider_error',
        vaultEvents,
        host.getActiveDiscovered(providerId)?.digest !== found.digest,
      )
    const copy = copyJson(raw, RESULT_LIMITS) as JsonObject
    if (
      !copy.structuredContent ||
      typeof copy.structuredContent !== 'object' ||
      Array.isArray(copy.structuredContent)
    )
      throw new HostReadFailure('invalid_response')
    structured = copy.structuredContent
  } catch (error) {
    rethrowHostReadFailure(error, (failure) =>
      assertCurrent(false, vaultEvents, failure),
    )
  }
  assertCurrent(false, vaultEvents)
  return structured
}
