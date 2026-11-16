import type { InvocationContext, JsonObject } from './protocol'
import { callProvider } from './providerCall'
import type { NativeCall } from './readExecution'

/** Read-only revocation; independent signal lets a cancelled approval discard its pending step. */
export async function discardMacroPreparation(
  call: NativeCall,
  prepared: JsonObject,
  invocation: InvocationContext,
): Promise<void> {
  const browser = call.handle.browser
  const reject = browser?.rejectPrepared
  if (
    call.tool.name !== 'macro_step' ||
    !prepared.prepareId ||
    !browser ||
    !reject ||
    !call.current()
  )
    return
  await callProvider({
    app: call.app,
    busy: call.busy,
    providerId: call.handle.pluginId,
    timeoutMs: 3000,
    invoke: (signal) =>
      Reflect.apply(reject, browser.receiver, [
        { prepareId: prepared.prepareId },
        { ...invocation, signal },
      ]),
  }).catch(() => undefined) // No execution, retry, or claim that revocation succeeded on a lost response.
}
