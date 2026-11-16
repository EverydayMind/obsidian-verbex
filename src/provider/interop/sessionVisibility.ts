import { withTimeout } from './discoveryLifecycle'
import type { Caller } from './protocol'
import type { SessionCall } from './sessionExecution'
import type { SessionGrant } from './sessionGrants'
import { parseOpenDocuments } from './sessionProtocol'
import { RESOLVE_TIMEOUT_MS } from './sessionTimeouts'

/** Whether the document has a view a person can see. Best effort, for the approval wording only. */
export async function visibility(
  call: SessionCall,
  caller: Caller,
  requestId: string,
  grant: SessionGrant,
): Promise<boolean | undefined> {
  const list = call.handle.editor?.openDocuments
  if (!list) return undefined
  call.trace?.mark('visibility.start')
  try {
    const documents = parseOpenDocuments(
      await withTimeout(
        Promise.resolve().then(() =>
          Reflect.apply(list, call.handle.editor?.receiver, [
            {
              caller: { ...caller },
              requestId,
              signal: call.ctx.signal ?? new AbortController().signal,
            },
          ]),
        ),
        call.resolveTimeoutMs ?? RESOLVE_TIMEOUT_MS,
        'Timed out while checking open documents',
      ),
    )
    const visible = documents.find(
      (item) =>
        item.path === grant.path &&
        item.sessionId === grant.sessionId &&
        item.incarnation === grant.incarnation,
    )?.hasView
    call.trace?.mark('visibility.end', { visible, count: documents.length })
    return visible
  } catch {
    call.trace?.mark('visibility.failed')
    return undefined
  }
}
