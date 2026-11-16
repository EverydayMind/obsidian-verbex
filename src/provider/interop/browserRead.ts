import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import { trustedBrowserContext } from './browserContext'
import { browserRejectionText, readBrowserTarget } from './browserContract'
import { copyInvocationContext } from './invocationCopy'
import { copyNativeToolArgs } from './nativeToolArgs'
import type { InvocationContext, JsonObject } from './protocol'
import { callProvider } from './providerCall'
import type { NativeCall } from './readExecution'
import { interruptedReadOutcome } from './readInterruption'

export async function prepareBrowserReadTarget(
  call: NativeCall,
  ctx: InvocationContext,
  changes: {
    onEvent: (event: string, path: string, oldPath?: string) => void
    hasChanges(): boolean
    affects(path: string): boolean
  },
  failed: (message: string) => AgentToolOutcome,
): Promise<{ target?: JsonObject; failure?: AgentToolOutcome }> {
  try {
    const target = await resolveBrowserReadTarget(call, ctx, changes.onEvent)
    if (changes.hasChanges())
      return {
        failure: interruptedReadOutcome(
          call,
          new Error('Vault changed during browser target resolution.'),
          changes,
        ),
      }
    return { target }
  } catch (error) {
    return {
      failure: changes.hasChanges()
        ? interruptedReadOutcome(call, error, changes)
        : failed(browserRejectionText(error, 'Browser target unavailable')),
    }
  }
}

/** Targetless global reads explicitly declare an empty input schema. */
export async function resolveBrowserReadTarget(
  call: NativeCall,
  ctx: InvocationContext,
  onVaultEvent?: (event: string, path: string, oldPath?: string) => void,
): Promise<JsonObject | undefined> {
  const properties = call.tool.inputSchema.properties as JsonObject | undefined
  if (properties && Object.keys(properties).length === 0) return undefined
  const scope = trustedBrowserContext(
    call.ctx.snapshot?.browserContext,
  )?.scopes.find((s) => s.providerId === call.handle.pluginId)
  const implicit =
    call.args.tabId === undefined && call.tool.name !== 'tabs_create'
  if (implicit && scope) {
    if (
      scope.status !== 'ready' ||
      !scope.target ||
      scope.digest !== call.digest ||
      scope.generation !== call.generation
    )
      throw new Error(
        'Submitted browser tab unavailable or ambiguous. Select a web tab.',
      )
    return scope.target
  }
  const browser = call.handle.browser
  if (!browser) throw new Error('Browser capability unavailable')
  const { raw } = await callProvider({
    app: call.app,
    busy: call.busy,
    providerId: call.handle.pluginId,
    signal: ctx.signal,
    timeoutMs: call.callTimeoutMs ?? 30_000,
    onVaultEvent,
    invoke: (signal) =>
      Reflect.apply(browser.resolveTarget, browser.receiver, [
        { toolName: call.tool.name, args: copyNativeToolArgs(call.args) },
        copyInvocationContext(ctx, signal),
      ]),
  })
  return readBrowserTarget(raw)
}
