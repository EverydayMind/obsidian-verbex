import type { App } from 'obsidian'
import { z } from 'zod'

import { t } from '../../i18n'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import { copyJson } from './descriptorReader'
import type { DiagnosticSpan } from './diagnostics'
import type { ProviderHandle } from './discovery'
import { callProvider } from './providerCall'
import type { SessionEditFact } from './sessionProtocol'

let sequence = 0
const receipt = z
  .object({ revealed: z.literal(true), located: z.boolean() })
  .strict()

/** Human-only navigation. This capability is never registered as a model tool. */
export async function revealEditorChange(options: {
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
}): Promise<{ revealed: true; located: boolean }> {
  const { handle, fact } = options
  const editor = handle.editor
  if (!editor?.reveal)
    throw new Error(
      t('ui.editorReveal.thisPluginDoesNotSupportLocationNavigation'),
    )
  const reveal = editor.reveal
  const path = options.vaultPath(fact.path)
  const target = {
    document: {
      path,
      sessionId: fact.sessionId,
      ...(fact.incarnation ? { incarnation: fact.incarnation } : {}),
    },
    ...(fact.incarnation && fact.preview[0]?.handle
      ? { handle: fact.preview[0].handle }
      : {}),
    ...(fact.changedPages[0] ? { page: fact.changedPages[0] } : {}),
  }
  const name = `plg__${handle.pluginId}__editor.reveal`
  const requestId = `reveal:${++sequence}`
  const destination = `plugin://${handle.pluginId}/agentinterop`
  const providerIdentity = {
    serverConfigHash: options.digest,
    connectionGeneration: options.generation,
    toolSchemaHash: await canonicalDigest({
      capability: 'editor.reveal',
      version: 1,
    }),
  }
  const execution = await issueLocalPluginCallPermit({
    name,
    args: target,
    runId: requestId,
    turnId: requestId,
    ...providerIdentity,
    destination,
  })
  await assertExternalCallMatches(execution, {
    name,
    args: target,
    destination,
    effect: 'vaultRead',
    providerIdentity,
  })
  if (!options.current() || options.busy.has(handle.pluginId))
    throw new Error(t('ui.editorReveal.thePluginChangedOrAPreviousCall'))
  consumeAuthorizedExecution(execution, { runId: requestId, turnId: requestId })
  const { raw } = await callProvider({
    trace: options.trace,
    app: options.app,
    busy: options.busy,
    providerId: handle.pluginId,
    timeoutMs: options.timeoutMs ?? 5000,
    invoke: (signal) =>
      Reflect.apply(reveal, editor.receiver, [
        {
          caller: {
            pluginId: options.selfId,
            conversationId: options.conversationId,
            runId: requestId,
            turnId: requestId,
          },
          requestId,
          signal,
        },
        target,
      ]),
  })
  if (!options.current())
    throw new Error(
      t('ui.editorReveal.thePluginChangedWhileOpeningTheLocation'),
    )
  const result = receipt.parse(
    copyJson(raw, { maxDepth: 2, maxNodes: 10, maxBytes: 1024 }),
  )
  options.trace?.mark('receipt', { located: !!target.handle && result.located })
  return { ...result, located: !!target.handle && result.located }
}
