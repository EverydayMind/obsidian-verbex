import {
  type AgentToolOutcome,
  toolFailed,
  toolRejected,
} from '../../core/llm/toolOutcome'
import { randomUUID } from '../../platform/node/api'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueProviderSessionEditPermit,
} from '../../security/promptInjectionBoundary'
import { coerceString } from '../../utils/coerceString'

import {
  browserRejectionText,
  checkPrepared,
  classifyReceipt,
  browserObject as object,
  receiptOutcome,
  unknownOutcome,
} from './browserContract'
import * as modelText from './browserExecutionText'
import { BrowserOperations } from './browserOperations'
import { resolveBrowserReadTarget } from './browserRead'
import { RESULT_LIMITS, copyJson, deepFreeze } from './descriptorReader'
import { copyInvocationContext } from './invocationCopy'
import { discardMacroPreparation } from './macroRejection'
import type { InvocationContext, JsonObject } from './protocol'
import { callProvider } from './providerCall'
import type { NativeCall } from './readExecution'

export type BrowserApproval = {
  providerName: string
  toolTitle: string
  args: JsonObject
  target: JsonObject
  card: JsonObject
  expiresAt: string
}
export type BrowserRuntime = {
  operations: BrowserOperations
  notifyExpired?: () => void
  approve: (
    request: BrowserApproval,
    signal?: AbortSignal,
  ) => Promise<'allow' | 'reject' | 'expired'>
}
/** Calls never use session grants. Every dispatch consumes one fresh human decision. */
export async function executeBrowserTool(
  call: NativeCall,
  runtime?: BrowserRuntime,
): Promise<AgentToolOutcome> {
  call = { ...call, args: deepFreeze(object(call.args)) }
  const fail = (text: string) =>
    toolFailed(text, { mutationScope: 'none', retry: { allowed: false } })
  const expired = () => {
    try {
      runtime?.notifyExpired?.()
    } catch {
      /* notification only */
    }
    return fail(modelText.browserExpired())
  }
  const browser = call.handle.browser
  if (
    !runtime ||
    !browser ||
    call.tool.browserAction === 'script' ||
    (call.tool.name === 'macro_step' && !browser.rejectPrepared)
  )
    return fail(modelText.browserGateClosed())
  const providerId = call.handle.pluginId
  const runId = call.ctx.runId ?? 'native'
  const invocation: InvocationContext = {
    caller: {
      pluginId: call.selfId,
      conversationId: call.ctx.conversationId ?? runId,
      runId,
      turnId: call.ctx.submittedTurnId ?? call.ctx.turnId ?? runId,
    },
    requestId: call.ctx.turnId ?? randomUUID(),
    signal: call.ctx.signal ?? new AbortController().signal,
    actor: { kind: 'agent', label: 'Verbex' },
    observations: [...(call.ctx.snapshot?.observations?.current() ?? [])],
    providerIdentity: {
      descriptorDigest: call.digest,
      generation: call.generation,
    },
    acceptsImages: false,
  }
  const invoke = async (method: 'prepare' | 'execute', req: JsonObject) => {
    if (!call.current() || invocation.signal.aborted)
      throw new Error('Browser call cancelled or provider changed')
    const { raw } = await callProvider({
      app: call.app,
      busy: call.busy,
      providerId,
      signal: invocation.signal,
      timeoutMs: call.callTimeoutMs ?? 30_000,
      invoke: (signal) =>
        Reflect.apply(browser[method], browser.receiver, [
          copyJson(req, RESULT_LIMITS) as JsonObject,
          copyInvocationContext(invocation, signal),
        ]),
    })
    return object(raw)
  }
  if (
    call.tool.name === 'macro_step' &&
    !invocation.observations?.includes(
      coerceString(object(call.args).observationId),
    )
  )
    return fail('Macro step requires an actually delivered observation')
  let prepared: JsonObject = {}
  let dispatched = false
  let confirmed = false
  try {
    let target: JsonObject
    try {
      await runtime.operations.assertClear(providerId)
      target = object(await resolveBrowserReadTarget(call, invocation))
      invocation.target = deepFreeze(target)
      prepared = await invoke('prepare', {
        toolName: call.tool.name,
        args: call.args,
      })
      const actual = await checkPrepared(prepared, {
        args: call.args,
        requestId: invocation.requestId,
        toolName: call.tool.name,
        browserAction: call.tool.browserAction,
        providerIdentity: invocation.providerIdentity,
        target,
        now: Date.now(),
      })
      const card = object(prepared.approvalCard)
      const decision = await runtime.approve(
        deepFreeze({
          providerName: providerId,
          toolTitle: call.tool.title ?? call.tool.name,
          args: object(
            call.tool.name === 'macro_step'
              ? prepared.normalizedArgs
              : call.args,
          ),
          target: actual,
          card,
          expiresAt: coerceString(prepared.expiresAt),
        }),
        invocation.signal,
      )
      if (decision === 'expired') return fail(modelText.browserExpired())
      if (decision !== 'allow')
        return toolRejected(modelText.browserRejected(), {
          mutationScope: 'none',
          retry: { allowed: false },
        })
    } catch (error) {
      return fail(browserRejectionText(error, 'Browser preparation failed'))
    }
    const operationId = randomUUID()
    let partialClickReported = false
    try {
      const req: JsonObject = {
        operationId,
        requestId: invocation.requestId,
        prepareId: prepared.prepareId,
        ticket: {
          ticketId: randomUUID(),
          operationId,
          requestId: invocation.requestId,
          prepareId: prepared.prepareId,
          sessionId: invocation.caller.conversationId,
          caller: invocation.caller,
          toolName: prepared.toolName,
          // checkPrepared bound this to the descriptor's browserAction.
          browserAction: prepared.browserAction,
          argsDigest: prepared.argsDigest,
          targetDigest: prepared.targetDigest,
          descriptorDigest: call.digest,
          providerGeneration: call.generation,
          policyEpoch: prepared.policyEpoch,
          observations: invocation.observations ?? [],
          issuedAt: new Date().toISOString(),
          expiresAt: prepared.expiresAt,
          approvedByUser: true,
        },
      }
      const destination = `plugin://${providerId}/browser/${operationId}`
      const providerIdentity = {
        serverConfigHash: call.digest,
        connectionGeneration: call.generation,
        toolSchemaHash: await canonicalDigest(call.tool.inputSchema),
      }
      const permit = await issueProviderSessionEditPermit({
        name: call.name,
        args: req,
        runId,
        turnId: invocation.requestId,
        ...providerIdentity,
        destination,
      })
      await assertExternalCallMatches(permit, {
        name: call.name,
        args: req,
        destination,
        effect: 'externalMutation',
        providerIdentity,
      })
      if (Date.parse(coerceString(prepared.expiresAt)) <= Date.now())
        return expired()
      if (!call.current() || invocation.signal.aborted)
        return fail(modelText.browserChanged())
      await runtime.operations.begin({
        operationId,
        providerId,
        conversationId: invocation.caller.conversationId,
        state: 'pending',
      })
      if (Date.parse(coerceString(prepared.expiresAt)) <= Date.now()) {
        await runtime.operations.settle(operationId, true)
        return expired()
      }
      if (!call.current() || invocation.signal.aborted) {
        await runtime.operations.settle(operationId, true)
        return fail('Browser call cancelled before dispatch')
      }
      consumeAuthorizedExecution(permit, {
        runId,
        turnId: invocation.requestId,
      })
      dispatched = true
      const receipt = await invoke('execute', req)
      if (!call.current() || invocation.signal.aborted)
        throw new Error('Provider identity changed after dispatch')
      partialClickReported =
        call.tool.name === 'click' &&
        receipt.operationId === operationId &&
        receipt.requestId === invocation.requestId &&
        receipt.prepareId === prepared.prepareId &&
        (receipt.dispatched === 'partial' ||
          receipt.dispatched === 'unknown') &&
        typeof receipt.inputsSent === 'number' &&
        Number.isSafeInteger(receipt.inputsSent) &&
        receipt.inputsSent > 0
      const kind = classifyReceipt(receipt, {
        operationId,
        requestId: invocation.requestId,
        prepareId: prepared.prepareId,
        target,
        toolName: call.tool.name,
        selectedDownload: object(prepared.approvalCard).download,
      })
      await runtime.operations.settle(operationId, true)
      confirmed = true
      return receiptOutcome(
        kind,
        operationId,
        receipt.observed,
        call.tool.name === 'tabs_create' && kind === 'applied'
          ? object(receipt.targetAfter)
          : undefined,
        call.tool.name === 'file_save' ? object(receipt.fileSave) : undefined,
      )
    } catch (error) {
      if (!dispatched)
        return fail(
          error instanceof Error ? error.message : 'Browser dispatch refused',
        )
      await runtime.operations.settle(operationId, false).catch(() => undefined)
      return unknownOutcome(operationId, partialClickReported)
    }
  } finally {
    if (!confirmed) await discardMacroPreparation(call, prepared, invocation)
  }
}
