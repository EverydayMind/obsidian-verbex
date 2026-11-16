import { z } from 'zod'

import { t } from '../../i18n'
import { randomUUID } from '../../platform/node/api'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import type { BrowserRuntime } from './browserExecution'
import type { BrowserOperation } from './browserOperations'
import { copyJson } from './descriptorReader'
import { checkFileSaveStatus, fileSaveSchema } from './downloadContract'
import type { HostContext } from './editorActions'
import { callProvider } from './providerCall'

const statusSchema = z
  .object({
    operationId: z.string().min(1),
    status: z.enum(['running', 'completed', 'unknown_provider_restarted']),
    dispatched: z.enum(['no', 'yes', 'partial', 'unknown']),
    application: z.enum(['applied', 'not_applied', 'unknown']),
    inputsSent: z.number().int().nonnegative().optional(),
    inputsPlanned: z.number().int().nonnegative().optional(),
    externalOutcome: z.literal('unknown'),
    fileSave: fileSaveSchema.optional(),
    retryable: z.literal(false),
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
      .optional(),
  })
  .strict()

export type BrowserStatus = z.infer<typeof statusSchema>

export function readBrowserStatus(raw: unknown, operationId: string) {
  const result = statusSchema.parse(
    copyJson(raw, { maxDepth: 3, maxNodes: 100, maxBytes: 4096 }),
  )
  if (
    result.operationId !== operationId ||
    (result.status !== 'completed' &&
      (result.dispatched !== 'unknown' || result.application !== 'unknown')) ||
    (result.status === 'completed' &&
      (result.inputsSent === undefined ||
        result.inputsPlanned === undefined)) ||
    (result.inputsSent !== undefined &&
      result.inputsPlanned !== undefined &&
      result.inputsSent > result.inputsPlanned)
  )
    throw new Error('Invalid browser status')
  checkFileSaveStatus(result)
  return result
}

/** Host-only passive review. Never settles the journal, retries an action or grants a token. */
export async function queryBrowserStatus(
  host: HostContext,
  runtime: BrowserRuntime | undefined,
  reference: BrowserOperation,
) {
  const record = (await runtime?.operations.unresolved())?.find(
    (item) =>
      item.operationId === reference.operationId &&
      item.providerId === reference.providerId &&
      item.conversationId === reference.conversationId,
  )
  if (!record)
    throw new Error(
      t('ui.browserStatus.noUnresolvedActionsFoundForThisConversation'),
    )
  await host.refresh()
  const found = host.getActiveDiscovered(record.providerId)
  const browser = found?.handle.browser
  if (
    !found ||
    !browser ||
    !host.isCurrent(record.providerId) ||
    host.busy.has(record.providerId)
  )
    throw new Error(t('ui.browserStatus.providerUnavailableOrAPreviousCallIs'))
  const current = () => {
    const latest = host.getActiveDiscovered(record.providerId)
    return (
      host.isCurrent(record.providerId) &&
      latest?.handle.provider === found.handle.provider &&
      latest.generation === found.generation &&
      latest.digest === found.digest &&
      latest.handle.browser?.receiver === browser.receiver &&
      latest.handle.browser?.status === browser.status
    )
  }
  const args = { operationId: record.operationId }
  const requestId = `browser-status:${randomUUID()}`
  const name = `plg__${record.providerId}__browser.status`
  const destination = `plugin://${record.providerId}/agentinterop`
  const providerIdentity = {
    serverConfigHash: found.digest,
    connectionGeneration: found.generation,
    toolSchemaHash: await canonicalDigest({
      capability: 'browser.status',
      version: 1,
    }),
  }
  const permit = await issueLocalPluginCallPermit({
    name,
    args,
    destination,
    runId: record.conversationId,
    turnId: requestId,
    ...providerIdentity,
  })
  await assertExternalCallMatches(permit, {
    name,
    args,
    destination,
    effect: 'vaultRead',
    providerIdentity,
  })
  if (!current()) throw new Error('Provider changed')
  consumeAuthorizedExecution(permit, {
    runId: record.conversationId,
    turnId: requestId,
  })
  const { raw } = await callProvider({
    app: host.app,
    busy: host.busy,
    providerId: record.providerId,
    timeoutMs: host.callTimeoutMs ?? 1500,
    invoke: (signal) =>
      Reflect.apply(browser.status, browser.receiver, [
        args,
        {
          caller: {
            pluginId: host.selfId,
            conversationId: record.conversationId,
            runId: requestId,
            turnId: requestId,
          },
          requestId,
          signal,
          observations: [],
          acceptsImages: false,
          actor: { kind: 'agent', label: host.selfId },
          providerIdentity: {
            descriptorDigest: found.digest,
            generation: found.generation,
          },
        },
      ]),
  })
  if (!current()) throw new Error('Provider changed')
  return readBrowserStatus(raw, record.operationId)
}
