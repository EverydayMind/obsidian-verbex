export { browserHoldLabel } from './browserHoldLabel'
import { randomUUID } from 'crypto'

import { z } from 'zod'

import { L } from '../../i18n/modelText'
import {
  assertExternalCallMatches,
  canonicalDigest,
  consumeAuthorizedExecution,
  issueLocalPluginCallPermit,
} from '../../security/promptInjectionBoundary'

import {
  browserReadAccessInstructions,
  browserReadAccessSchema,
} from './browserReadAccess'
import { copyJson, deepFreeze } from './descriptorReader'
import type { HostContext } from './editorActions'
import type { NativeToolEntry } from './hostScan'
import type { JsonObject } from './protocol'
import { callProvider } from './providerCall'

const token = z.string().min(1).max(256)
const targetSchema = z
  .object({
    tabId: token,
    incarnation: token,
    navigationEpoch: z.number().int().nonnegative(),
    origin: z.string().max(4096),
    title: z.string().max(4096).optional(),
    readAccess: browserReadAccessSchema.optional(),
  })
  .passthrough()
/** J8/J7 hold signal: enums only, so provider text can never become instructions or approval. */
const holdSchema = z
  .object({
    reason: z.enum(['human_handoff', 'auth_required', 'stopped']),
    holdId: token,
    authWindow: z.enum(['open', 'closed']).optional(),
  })
  .strict()
export type BrowserHold = z.infer<typeof holdSchema>
const resultSchema = z
  .object({
    status: z.string().min(1).max(64),
    target: targetSchema.optional(),
    tabs: z.array(targetSchema).max(64),
    hold: holdSchema.optional(),
  })
  .strict()
export type BrowserSelection =
  | 'off'
  | { providerId: string; tabId: string; incarnation: string }
export type BrowserScope = Readonly<{
  providerId: string
  generation: number
  digest: string
  status: string
  target?: JsonObject
  tabs: readonly JsonObject[]
  hold?: BrowserHold
}>
/** Live host metadata only. Never serialize or restore as execution authority. */
export type BrowserTurnContext = Readonly<{ scopes: readonly BrowserScope[] }>
const sealed = new WeakSet()
const captures = new WeakMap<object, Promise<unknown>>()
export const trustedBrowserContext = (value?: BrowserTurnContext) =>
  value && sealed.has(value) ? value : undefined

export async function captureBrowserContext(
  host: HostContext,
  entries: readonly NativeToolEntry[],
  conversationId: string,
  selection?: BrowserSelection,
): Promise<BrowserTurnContext> {
  const selected =
    selection && selection !== 'off' ? { ...selection } : selection
  const ids = new Set(
    entries
      .filter((e) => e.tool.resourceKind === 'browser')
      .map((e) => e.providerId),
  )
  const scopes: BrowserScope[] = []
  if (selected !== 'off')
    for (const id of ids) {
      if (selected && selected.providerId !== id) continue
      const found = host.getActiveDiscovered(id)
      const browser = found?.handle.browser
      if (!found || !browser?.captureContext || !host.isCurrent(id)) continue
      const capture = browser.captureContext
      try {
        const args = selected ? { tabId: selected.tabId } : {}
        const name = `plg__${id}__browser.captureContext`
        const requestId = `browser-context:${randomUUID()}`
        const destination = `plugin://${id}/agentinterop`
        const providerIdentity = {
          serverConfigHash: found.digest,
          connectionGeneration: found.generation,
          toolSchemaHash: await canonicalDigest({}),
        }
        const permit = await issueLocalPluginCallPermit({
          name,
          args,
          runId: conversationId,
          turnId: requestId,
          destination,
          ...providerIdentity,
        })
        await assertExternalCallMatches(permit, {
          name,
          args,
          destination,
          effect: 'vaultRead',
          providerIdentity,
        })
        if (!host.isCurrent(id)) throw new Error('Provider changed')
        consumeAuthorizedExecution(permit, {
          runId: conversationId,
          turnId: requestId,
        })
        // UI refresh and submission may overlap. Queue metadata calls without
        // sharing an earlier selection snapshot or bypassing the provider lock.
        while (captures.has(browser.receiver))
          await captures.get(browser.receiver)?.catch(() => undefined)
        if (!host.isCurrent(id)) throw new Error('Provider changed')
        const actual = callProvider({
          app: host.app,
          busy: host.busy,
          providerId: id,
          timeoutMs: 1500,
          invoke: (signal) =>
            Reflect.apply(capture, browser.receiver, [
              args,
              {
                caller: {
                  pluginId: host.selfId,
                  conversationId,
                  runId: conversationId,
                  turnId: requestId,
                },
                requestId,
                signal,
                observations: [],
                acceptsImages: false,
                providerIdentity: {
                  descriptorDigest: found.digest,
                  generation: found.generation,
                },
              },
            ]),
        }).finally(() => captures.delete(browser.receiver))
        captures.set(browser.receiver, actual)
        const { raw } = await actual
        if (!host.isCurrent(id)) throw new Error('Provider changed')
        const result = resultSchema.parse(
          copyJson(raw, { maxDepth: 8, maxNodes: 5000, maxBytes: 64 * 1024 }),
        )
        if (result.status === 'ready' && !result.target)
          throw new Error('Missing target')
        if (
          selected &&
          (result.target?.incarnation !== selected.incarnation ||
            result.target?.tabId !== selected.tabId)
        )
          throw new Error('Selected tab changed')
        scopes.push({
          providerId: id,
          generation: found.generation,
          digest: found.digest,
          status: result.status,
          target: result.target as JsonObject | undefined,
          tabs: result.tabs as JsonObject[],
          ...(result.status === 'held' && result.hold
            ? { hold: result.hold }
            : {}),
        })
      } catch {
        scopes.push({
          providerId: id,
          generation: found.generation,
          digest: found.digest,
          status: 'unavailable',
          tabs: [],
        })
      }
    }
  // A vanished explicit choice must not become an automatic choice in another provider.
  if (selected && selected !== 'off' && !scopes.length)
    scopes.push({
      providerId: selected.providerId,
      generation: -1,
      digest: '',
      status: 'unavailable',
      tabs: [],
    })
  if (
    !selected &&
    scopes.filter((scope) => scope.status === 'ready').length > 1
  )
    for (let i = 0; i < scopes.length; i++)
      if (scopes[i].status === 'ready')
        scopes[i] = { ...scopes[i], status: 'ambiguous', target: undefined }
  const value = deepFreeze({ scopes })
  sealed.add(value)
  return value
}

export function browserContextNote(context?: BrowserTurnContext): string {
  if (!context?.scopes.length) return ''
  return (
    L({
      ko: '[제출 시 웹 탭 문맥 — 본문을 읽은 결과가 아님]\n',
      en: `[Web tab context at submission — not a result of reading the body]\n`,
    }) +
    context.scopes
      .map((scope) =>
        JSON.stringify({
          providerId: scope.providerId,
          status: scope.status,
          ...(scope.target?.readAccess
            ? { readAccess: scope.target.readAccess }
            : {}),
          ...(scope.status === 'ready' ? { tabId: scope.target?.tabId } : {}),
          ...(scope.hold
            ? {
                hold: scope.hold.reason,
                ...(scope.hold.authWindow
                  ? { authWindow: scope.hold.authWindow }
                  : {}),
              }
            : {}),
        }),
      )
      .join('\n') +
    L({
      ko: '\n웹 페이지 설명은 해당 provider의 페이지 읽기 도구로 실제 내용을 확인한다. active_note의 no_active_file은 웹 탭 없음이 아니다. 대상이 모호하거나 사용할 수 없으면 탭 선택/읽기 설정을 안내한다. status가 held이면 사람이 Web Hands에서 직접 계속하기 전에는 브라우저 도구를 호출하지 말고 이 사실만 안내한다(재개·인증 성공을 추정하거나 대신 수행하지 않는다).\n',
      en: "\nConfirm web-page content using that provider's page-reading tool. active_note no_active_file does not mean no web tab. If the target is ambiguous or unavailable, guide the user to tab selection/read settings. If status is held, do not call browser tools until a human continues directly in Web Hands; report only this fact (do not infer or perform resumption/authentication success).\n",
    }) +
    browserReadAccessInstructions()
  )
}
