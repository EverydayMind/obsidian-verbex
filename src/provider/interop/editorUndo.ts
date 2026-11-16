import type { App } from 'obsidian'

import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueProviderSessionEditPermit,
} from '../../security/promptInjectionBoundary'

import type { DiagnosticSpan } from './diagnostics'
import type { ProviderHandle } from './discovery'
import { parseUndoResult, resolveUndoTarget } from './editorUndoTarget'
import { callProvider } from './providerCall'
import type { SessionEditFact } from './sessionProtocol'

let sequence = 0

export type UndoResult = {
  undone: boolean
  revisionAfter?: number
  message?: string
}

export type UndoOptions = {
  trace?: DiagnosticSpan
  app: App
  busy: Set<string>
  handle: ProviderHandle
  digest: string
  generation: number
  current: () => boolean
  vaultPath: (path: string) => string
  selfId: string
  conversationId: string
  fact: SessionEditFact
  timeoutMs?: number
}

/** Human-requested undo of the exact AI edit in this card. */
export async function undoEditorChange(
  options: UndoOptions,
): Promise<UndoResult> {
  const { handle, fact } = options
  const target = await resolveUndoTarget(options)
  const path = options.vaultPath(fact.path)
  const name = `plg__${handle.pluginId}__undo_last_edit`
  const requestId = `undo:${++sequence}`
  const destination = `plugin://${handle.pluginId}/agentinterop/session/${fact.sessionId}`
  const args = { path }

  const providerIdentity = {
    serverConfigHash: options.digest,
    connectionGeneration: options.generation,
    toolSchemaHash: await canonicalDigest({
      tool: 'undo_last_edit',
      version: 1,
    }),
  }
  const execution = await issueProviderSessionEditPermit({
    name,
    args,
    runId: requestId,
    turnId: requestId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(execution, {
    name,
    args,
    destination,
    effect: 'externalMutation',
    providerIdentity,
  })

  if (!options.current() || options.busy.has(handle.pluginId))
    throw new Error(t('nativeProviderR10.editorBusy'))

  consumeAuthorizedExecution(execution, { runId: requestId, turnId: requestId })

  const { raw } = await callProvider({
    trace: options.trace,
    app: options.app,
    busy: options.busy,
    providerId: handle.pluginId,
    timeoutMs: options.timeoutMs ?? 10_000,
    invoke: (signal) =>
      Reflect.apply(handle.callTool, handle.provider, [
        'undo_last_edit',
        args,
        {
          caller: {
            pluginId: options.selfId,
            conversationId: options.conversationId,
            runId: requestId,
            turnId: requestId,
          },
          requestId,
          signal,
          actor: { kind: 'agent', label: 'Verbex' },
          grant: { kind: 'document', path },
          target,
        },
      ]),
  })

  if (!options.current())
    throw new Error(t('nativeProviderR10.undoPluginChanged'))

  try {
    const result = parseUndoResult(raw, options)
    options.trace?.mark('receipt', {
      applied: result.undone ? 'yes' : 'no',
      revisionAfter: result.revisionAfter,
    })
    return result
  } catch (error) {
    options.trace?.mark('receipt.invalid')
    return {
      undone: false,
      message:
        error instanceof Error
          ? error.message
          : t('nativeProviderR10.undoResultUnavailable'),
    }
  }
}
