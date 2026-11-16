import type { App } from 'obsidian'

import { t } from '../../i18n'

import type { ProviderCurrentCause } from './currentProvider'
import type { InteropDiagnostics } from './diagnostics'
import type { ProviderHandle } from './discovery'
import { revealEditorChange } from './editorReveal'
import { type UndoResult, undoEditorChange } from './editorUndo'
import type { ProviderDescriptor } from './protocol'
import { type SessionEditFact } from './sessionProtocol'

export type HostContext = {
  app: App
  selfId: string
  busy: Set<string>
  vaultPath: (path: string) => string
  diagnostics: InteropDiagnostics
  refresh: (signal?: AbortSignal) => Promise<void>
  getActiveDiscovered: (providerId: string) =>
    | {
        handle: ProviderHandle
        digest: string
        generation: number
        descriptor?: ProviderDescriptor
      }
    | undefined
  isCurrent: (providerId: string, toolName?: string) => boolean
  currentProviderCause?: (
    providerId: string,
  ) => ProviderCurrentCause | undefined
  reportProviderFault?: (handle: ProviderHandle) => void
  callTimeoutMs?: number
  resolveTimeoutMs?: number
}

export async function revealEditorEdit(
  host: HostContext,
  fact: SessionEditFact,
  conversationId: string,
): Promise<{ revealed: true; located: boolean }> {
  return host.diagnostics.measure(
    'reveal',
    {
      providerId: fact.providerId,
      conversationId,
      path: fact.path,
      sessionId: fact.sessionId,
    },
    async (trace) => {
      await host.refresh()
      const found = host.getActiveDiscovered(fact.providerId)
      if (!found || !host.isCurrent(fact.providerId))
        throw new Error(t('nativeProviderR10.editorUnavailable'))
      return revealEditorChange({
        app: host.app,
        busy: host.busy,
        handle: found.handle,
        digest: found.digest,
        generation: found.generation,
        current: () => host.isCurrent(fact.providerId),
        vaultPath: host.vaultPath,
        selfId: host.selfId,
        conversationId,
        fact,
        trace,
        timeoutMs: host.callTimeoutMs,
      })
    },
  )
}

export async function undoEditorEdit(
  host: HostContext,
  fact: SessionEditFact,
  conversationId: string,
): Promise<UndoResult> {
  return host.diagnostics.measure(
    'undo',
    {
      providerId: fact.providerId,
      conversationId,
      path: fact.path,
      sessionId: fact.sessionId,
    },
    async (trace) => {
      await host.refresh()
      const found = host.getActiveDiscovered(fact.providerId)
      if (!found || !host.isCurrent(fact.providerId))
        throw new Error(t('nativeProviderR10.editorUnavailable'))
      return undoEditorChange({
        app: host.app,
        busy: host.busy,
        handle: found.handle,
        digest: found.digest,
        generation: found.generation,
        current: () => host.isCurrent(fact.providerId),
        vaultPath: host.vaultPath,
        selfId: host.selfId,
        conversationId,
        fact,
        trace,
        timeoutMs: host.callTimeoutMs,
      })
    },
  )
}

export {
  queryAllOpenDocuments,
  discardAgentDocumentChanges,
  releaseAgentDocuments,
} from './editorLifecycle'
