import type { App } from 'obsidian'

import type { AgentToolOutcome } from '../../core/llm/toolOutcome'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'
import type { OwnershipOptions } from '../ownershipTypes'
import type { ProviderExecutionContext } from '../providerTurnTypes'

import { readBrowserImageResult } from './browserImageResult'
import { prepareBrowserReadTarget } from './browserRead'
import type { DiagnosticSpan } from './diagnostics'
import type { ProviderHandle } from './discovery'
import { nativeExecutionFailure as failed } from './nativeExecutionFailure'
import { nativeReadOutcome } from './nativeReadOutcome'
import { copyNativeToolArgs } from './nativeToolArgs'
import type { InvocationContext, JsonObject, ToolDescriptor } from './protocol'
import { callProvider } from './providerCall'
import { providerCallCancelled } from './providerCallError'
import {
  discardedReadOutcome,
  interruptedReadOutcome,
  lateReadDiscarded,
} from './readInterruption'
import { markReadReceipt, readResultText } from './readResultText'
import { repeatedRead } from './repeatedRead'
import { readToolResult } from './resultReader'
import { observationTokens } from './sessionProtocol'
import { turnScopeFor } from './turnScope'
import { trackVaultChanges } from './vaultEventObservers'

/** One validated call of an approved provider tool, as the host hands it to an effect runner. */
export type NativeCall = {
  trace?: DiagnosticSpan
  app: App
  busy: Set<string>
  selfId: string
  vaultPath: (path: string) => string
  name: string
  tool: ToolDescriptor
  handle: ProviderHandle
  digest: string
  generation: number
  args: JsonObject
  ctx: ProviderExecutionContext
  /** False once the host was disposed or the provider object was replaced. */
  current: () => boolean
  reportFault?: () => void
  assertOwnership?: (path: string, options?: OwnershipOptions) => Promise<void>
  callTimeoutMs?: number
}

/** Runs a declared read/pure tool; same-process side effects are not sandboxed. */
export async function executeReadTool(
  call: NativeCall,
): Promise<AgentToolOutcome> {
  const { handle, ctx, tool, args, name } = call
  const providerId = handle.pluginId
  const runId = ctx.runId ?? 'native'
  const providerIdentity = {
    serverConfigHash: call.digest,
    connectionGeneration: call.generation,
    toolSchemaHash: await canonicalDigest(tool.inputSchema),
  }
  const execution = await issueLocalPluginCallPermit({
    name,
    args,
    runId,
    turnId: ctx.turnId ?? name,
    ...providerIdentity,
    destination: `plugin://${providerId}/agentinterop`,
  })
  await assertExternalCallMatches(execution, {
    name,
    args,
    destination: `plugin://${providerId}/agentinterop`,
    effect: 'vaultRead',
    providerIdentity,
  })
  if (ctx.signal?.aborted || !call.current() || call.busy.has(providerId))
    return failed(providerCallCancelled())
  consumeAuthorizedExecution(execution, {
    runId,
    turnId: ctx.turnId ?? name,
  })
  const invocation: InvocationContext = {
    caller: {
      pluginId: call.selfId,
      conversationId: ctx.conversationId ?? runId,
      runId,
      turnId: ctx.submittedTurnId ?? ctx.turnId ?? runId,
    },
    requestId: ctx.turnId ?? name,
    signal: ctx.signal ?? new AbortController().signal,
    actor: { kind: 'agent', label: 'Verbex' },
    observations: [...(ctx.snapshot?.observations?.current() ?? [])],
    acceptsImages:
      tool.resourceKind === 'browser' && ctx.snapshot?.browserImages === true,
    providerIdentity: {
      descriptorDigest: call.digest,
      generation: call.generation,
    },
    scope: turnScopeFor(ctx.snapshot?.turnScope, providerId, call.generation),
  }
  const changedPaths = trackVaultChanges(call.vaultPath)
  if (tool.resourceKind === 'browser') {
    const resolved = await prepareBrowserReadTarget(
      call,
      invocation,
      changedPaths,
      failed,
    )
    if (resolved.failure) return resolved.failure
    invocation.target = resolved.target
    if (ctx.signal?.aborted || !call.current())
      return failed('Browser target changed or cancelled.')
  }
  const discarded = (message: string) =>
    discardedReadOutcome(call, message, changedPaths.affects)
  let response: Awaited<ReturnType<typeof callProvider>>
  try {
    response = await callProvider({
      trace: call.trace,
      app: call.app,
      busy: call.busy,
      providerId,
      signal: ctx.signal,
      timeoutMs: call.callTimeoutMs ?? 30_000,
      onVaultEvent: changedPaths.onEvent,
      invoke: (signal) =>
        Reflect.apply(handle.callTool, handle.provider, [
          tool.name,
          copyNativeToolArgs(args),
          { ...invocation, signal },
        ]),
    })
  } catch (error) {
    return interruptedReadOutcome(call, error, changedPaths)
  }
  const { raw, vaultEvents } = response
  if (ctx.signal?.aborted || !call.current())
    return discarded(lateReadDiscarded())
  const result =
    tool.resourceKind === 'browser'
      ? await readBrowserImageResult(
          raw,
          tool,
          invocation.acceptsImages === true,
          call.vaultPath,
        )
      : { ...readToolResult(raw, tool, call.vaultPath), images: [] }
  if (ctx.signal?.aborted || !call.current())
    return discarded('Browser result cancelled')
  markReadReceipt(call, result, vaultEvents)
  const repeated = await repeatedRead(ctx.snapshot?.observations, result, {
    providerId,
    digest: call.digest,
    generation: call.generation,
    name,
    toolName: tool.name,
    args,
    vaultEvents: !!vaultEvents,
  })
  let assembled: Awaited<ReturnType<typeof readResultText>>
  try {
    assembled = await readResultText(call, result, repeated, vaultEvents)
  } catch (error) {
    if (ctx.signal?.aborted || !call.current())
      return discarded(lateReadDiscarded())
    throw error
  }
  if (ctx.signal?.aborted || !call.current())
    return discarded(lateReadDiscarded())
  const { text, disclosure } = assembled
  if (!result.isError && !result.truncated && !vaultEvents)
    ctx.snapshot?.observations?.record(
      ctx.turnId ?? name,
      text,
      observationTokens(result.meta),
      result.images.map((image) => image.url),
    )
  return nativeReadOutcome(
    call,
    result,
    text,
    disclosure,
    vaultEvents,
    changedPaths.affects,
  )
}
