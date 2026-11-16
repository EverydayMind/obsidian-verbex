import {
  type AgentToolOutcome,
  toolFailed,
  toolRejected,
} from '../../core/llm/toolOutcome'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueProviderSessionEditPermit,
} from '../../security/promptInjectionBoundary'
import { ownershipErrorText, ownershipRetryable } from '../ownershipTypes'

import { withTimeout } from './discoveryLifecycle'
import { ownershipHostBlock } from './hostBlockState'
import { copyNativeToolArgs } from './nativeToolArgs'
import type { Caller } from './protocol'
import { ProviderCallInterrupted, callProvider } from './providerCall'
import type { NativeCall } from './readExecution'
import { readToolResult } from './resultReader'
import * as wording from './sessionExecutionText'
import type { SessionGrant, SessionGrantStore } from './sessionGrants'
import { sessionOutcome } from './sessionOutcome'
import {
  isPlanningResolve,
  planningOutcome,
  validPlanningReceipt,
} from './sessionPlanning'
import {
  ResolvedTarget,
  SessionEditReceipt,
  observationTokens,
  parseResolvedTarget,
  readSessionMeta,
} from './sessionProtocol'
import { RESOLVE_TIMEOUT_MS, SESSION_CALL_TIMEOUT_MS } from './sessionTimeouts'
import { visibility } from './sessionVisibility'
import { copyTurnScope, turnScopeFor } from './turnScope'

export { RESOLVE_TIMEOUT_MS, SESSION_CALL_TIMEOUT_MS } from './sessionTimeouts'

export type SessionApprovalRequest = {
  providerId: string
  providerName: string
  pluginVersion: string
  toolTitle: string
  path: string
  /** Whether a person can see the document right now. Unknown when the provider cannot tell. */
  visible?: boolean
}
export type SessionApprovalHandler = (
  request: SessionApprovalRequest,
  signal?: AbortSignal,
) => Promise<'allow' | 'reject'>

export type SessionCall = NativeCall & {
  providerName: string
  grants: SessionGrantStore
  approve?: SessionApprovalHandler
  resolveTimeoutMs?: number
}

const errorText = (error: unknown, fallback: string): string =>
  ownershipErrorText(error, fallback, 500)

/**
 * Runs one `session` tool: an edit of the provider's unsaved working copy.
 * Order: fix the real target, check it against the document grant of this
 * conversation (asking the user the first time), issue and consume an
 * externalMutation permit bound to that target, call the provider with the
 * target pinned, then compare the receipt with the pinned target.
 *
 * Once the provider call has started, anything that leaves "was it applied?"
 * unanswered (timeout, cancel, throw, malformed or contradictory receipt)
 * pauses the run. It is never turned into a plain failure that invites a retry.
 */
export async function executeSessionTool(
  call: SessionCall,
): Promise<AgentToolOutcome> {
  const { handle, ctx, tool, args } = call
  ctx.snapshot?.observations?.invalidateRepeatedRead()
  const providerId = handle.pluginId
  const planningResolve = isPlanningResolve(providerId, tool.name, args.mode)
  const runId = ctx.runId ?? 'native'
  const caller: Caller = {
    pluginId: call.selfId,
    conversationId: ctx.conversationId ?? runId,
    runId,
    turnId: ctx.submittedTurnId ?? ctx.turnId ?? runId,
  }
  const requestId = ctx.turnId ?? call.name
  const signal = ctx.signal ?? new AbortController().signal
  const scope = turnScopeFor(
    ctx.snapshot?.turnScope,
    providerId,
    call.generation,
  )
  const argsDigest = await canonicalDigest(args)
  let path = typeof args.path === 'string' ? args.path : ''
  const key = (operation: string = argsDigest) =>
    `plg:${providerId}:${caller.turnId}:${tool.name}:${path}:${operation}`
  const disclosure = () => ({
    connectorId: providerId,
    canonicalVaultPaths: path ? [path] : [],
    unattributedFiles: path ? 0 : 1,
  })
  const notApplied = (message: string, retryable: boolean, error?: unknown) =>
    toolFailed(wording.failed(message), {
      terminal: false,
      retry: { allowed: retryable },
      mutationScope: 'provider_session',
      mutationKey: key(),
      ...ownershipHostBlock(error),
    })
  const paused = (message: string): AgentToolOutcome => ({
    status: 'paused',
    terminal: true,
    mutation: 'none',
    mutationScope: 'provider_session',
    retry: { allowed: false },
    disclosure: disclosure(),
    displayText: wording.paused(message),
  })

  // 1. The provider fixes the real target. No user file or working copy changes here.
  let target: Extract<ResolvedTarget, { kind: 'existing' }>
  call.trace?.mark('resolve.start', { providerId, generation: call.generation })
  try {
    const resolved = parseResolvedTarget(
      await withTimeout(
        Promise.resolve().then(() =>
          Reflect.apply(handle.resolveTarget as never, handle.provider, [
            tool.name,
            // The provider may retain this reference after target resolution.
            // Keep the host's approved and permit-bound arguments private.
            copyNativeToolArgs(args),
            {
              caller: { ...caller },
              scope: copyTurnScope(scope),
              requestId,
              signal,
            },
          ]),
        ),
        call.resolveTimeoutMs ?? RESOLVE_TIMEOUT_MS,
        wording.resolveTimeout(),
      ),
    )
    if (resolved.kind !== 'existing')
      return notApplied(wording.existingOnly(), false)
    target = resolved
    call.trace?.mark('resolve.end', {
      path: target.document.path,
      sessionId: target.document.sessionId,
      incarnation: target.document.incarnation,
      revisionBefore: target.revision,
    })
    path = call.vaultPath(target.document.path)
    if (path !== target.document.path)
      return notApplied(wording.invalidPath(), false)
    await call.assertOwnership?.(path)
  } catch (error) {
    return notApplied(
      errorText(error, wording.resolveFailed()),
      ownershipRetryable(error, true),
      error,
    )
  }
  if (ctx.signal?.aborted || !call.current())
    return notApplied(wording.cancelled(), false)

  // 2. Document grant of this conversation. Bound to the incarnation, not the epoch.
  const grant: SessionGrant = {
    conversationId: caller.conversationId,
    providerId,
    generation: call.generation,
    digest: call.digest,
    path,
    sessionId: target.document.sessionId,
    incarnation: target.document.incarnation,
  }
  if (!call.grants.has(grant)) {
    const rejected = (message: string) =>
      toolRejected(wording.rejected(message), {
        mutationScope: 'provider_session',
        mutationKey: key(),
      })
    if (!call.approve) return rejected(wording.approvalUnavailable())
    const visible = await visibility(call, caller, requestId, grant)
    call.trace?.mark('approval.start', { visible })
    const decision = await call.approve(
      {
        providerId,
        providerName: call.providerName,
        pluginVersion: handle.pluginVersion,
        toolTitle: tool.title ?? tool.name,
        path,
        visible,
      },
      ctx.signal,
    )
    call.trace?.mark(
      decision === 'allow' ? 'approval.allow' : 'approval.reject',
    )
    if (decision !== 'allow') return rejected(wording.userRejected(path))
    if (ctx.signal?.aborted || !call.current())
      return notApplied(wording.cancelled(), false)
    call.grants.add(grant)
  }
  if (call.busy.has(providerId)) return notApplied(wording.busy(), true)

  // 3. Permit bound to the exact call and the pinned target.
  const destination = `plugin://${providerId}/agentinterop/session/${target.document.sessionId}`
  const providerIdentity = {
    serverConfigHash: call.digest,
    connectionGeneration: call.generation,
    toolSchemaHash: await canonicalDigest(tool.inputSchema),
  }
  const execution = await issueProviderSessionEditPermit({
    name: call.name,
    args,
    runId,
    turnId: requestId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(execution, {
    name: call.name,
    args,
    destination,
    effect: 'externalMutation',
    providerIdentity,
  })
  // A revoke or cancel that lands before the provider starts still wins.
  try {
    await call.assertOwnership?.(path)
  } catch (error) {
    return notApplied(
      errorText(error, wording.ownershipChanged()),
      ownershipRetryable(error, true),
      error,
    )
  }
  if (ctx.signal?.aborted || !call.current() || !call.grants.has(grant))
    return notApplied(wording.revoked(), false)
  consumeAuthorizedExecution(execution, {
    runId,
    turnId: requestId,
  })
  call.trace?.mark('permit')

  // 4. The provider edits with the target pinned; from here on, doubt pauses.
  let raw: unknown
  let vaultEvents = 0
  try {
    ;({ raw, vaultEvents } = await callProvider({
      trace: call.trace,
      app: call.app,
      busy: call.busy,
      providerId,
      signal: ctx.signal,
      timeoutMs: call.callTimeoutMs ?? SESSION_CALL_TIMEOUT_MS,
      invoke: (signal) =>
        Reflect.apply(handle.callTool, handle.provider, [
          tool.name,
          copyNativeToolArgs(args),
          {
            caller: { ...caller },
            requestId,
            signal,
            actor: { kind: 'agent', label: 'Verbex' },
            scope: copyTurnScope(scope),
            target: parseResolvedTarget(target),
            observations: [...(ctx.snapshot?.observations?.current() ?? [])],
            grant: { kind: 'document', path },
          },
        ]),
    }))
  } catch (error) {
    return paused(
      error instanceof ProviderCallInterrupted
        ? error.message
        : wording.noResult(),
    )
  }
  if (ctx.signal?.aborted || !call.current() || !call.grants.has(grant))
    return paused(wording.changedDuringCall())
  let receipt: SessionEditReceipt
  let text: string
  let isError: boolean, retryable: boolean
  let observationStep = false
  let preview: { handle: string; before: string; after: string }[]
  let tokens: string[]
  let location: { handle?: string } | undefined
  try {
    const result = readToolResult(raw, tool, call.vaultPath)
    ;({ receipt, preview, location } = readSessionMeta(result.meta))
    if (
      !result.isError ||
      result.errorCode !== 'PROTECTED_CONTENT' ||
      receipt.applied !== 'no'
    )
      location = undefined
    call.trace?.mark('receipt', {
      applied: receipt.applied,
      errorCode: result.errorCode,
      revisionBefore: receipt.revisionBefore,
      revisionAfter: receipt.revisionAfter,
      count: receipt.changedHandles.length,
      retryable: result.retryable,
      truncated: result.truncated,
    })
    tokens = result.truncated ? [] : observationTokens(result.meta)
    ;({ isError, retryable } = result)
    observationStep =
      isError &&
      result.errorCode === 'OBSERVATION_REQUIRED' &&
      receipt.applied === 'no'
    const elsewhere =
      receipt.path !== path ||
      receipt.sessionId !== target.document.sessionId ||
      result.paths.some((reported) => reported !== path)
    if (elsewhere) {
      call.trace?.mark('target.mismatch')
      // The edit may have landed on another document. Nothing the provider says is trusted further.
      call.grants.revoke({ conversationId: caller.conversationId, providerId })
      return paused(wording.wrongTarget())
    }
    if (
      planningResolve &&
      !validPlanningReceipt(
        receipt,
        target.revision,
        result.isError,
        result.errorCode,
      )
    )
      return paused(wording.planningMismatch())
    if (receipt.applied === 'unknown' || (receipt.applied === 'yes' && isError))
      return paused(wording.unconfirmed())
    text = L({
      ko: `${modelMarker('pluginResult', 'ko')} ${providerId}/${tool.name}, v${handle.pluginVersion}]\n${result.text}${vaultEvents ? `\n호출 중 Vault 변경 ${vaultEvents}건 관측, 원인 미확정` : ''}`,
      en: `${modelMarker('pluginResult', 'en')} ${providerId}/${tool.name}, v${handle.pluginVersion}]\n${result.text}${vaultEvents ? `\nObserved ${vaultEvents} Vault changes during the call; cause unconfirmed` : ''}`,
    })
  } catch {
    call.trace?.mark('receipt.invalid')
    return paused(wording.invalidReceipt())
  }
  const common = {
    mutationScope: 'provider_session' as const,
    mutationKey: key(receipt.operationId),
    disclosure: disclosure(),
  }
  const visible =
    receipt.applied === 'yes'
      ? await visibility(call, caller, requestId, grant)
      : undefined
  if (ctx.signal?.aborted || !call.current() || !call.grants.has(grant))
    return paused(wording.changedDuringReadback())
  if (planningResolve && !isError) {
    const outcome = planningOutcome(text, key, argsDigest, disclosure())
    ctx.snapshot?.observations?.record(requestId, outcome.displayText, tokens)
    return outcome
  }
  const outcome = sessionOutcome({
    receipt,
    text,
    common,
    providerId,
    tool: tool.name,
    path,
    incarnation: grant.incarnation,
    visible,
    preview,
    isError,
    retryable,
    location,
    observationStep,
  })
  ctx.snapshot?.observations?.record(requestId, outcome.displayText, tokens)
  return outcome
}
