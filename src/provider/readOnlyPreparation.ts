import { documentJobReferences } from '../context/documentJobReferences'

import { peekDocumentJobHost } from './interop/documentJobHost'
import { documentJobTurnPolicy } from './interop/documentJobTurnPolicy'
import type { NativeProviderHost } from './interop/NativeProviderHost'
import { providerTurnIdentifier } from './providerTurnSnapshot'
import type { ProviderRuntime } from './ToolProviderHub'

export type ReadOnlyPreparation = {
  readOnly?: boolean
  now?: string
}

export function emptyProviderJobTurn() {
  return {
    active: false,
    fired: false,
    samplePaths: [] as string[],
    formatSources: [] as string[],
    policy: documentJobTurnPolicy({
      request: '',
      referencedHwp: 'none',
      activeJob: false,
    }),
  }
}

/** Cached metadata only. A missing cache is never filled by invoking providers. */
export function preparationRegistry(
  registry: ProviderRuntime | undefined,
  input: ReadOnlyPreparation & {
    runId: string
    conversationId?: string
    currentFile?: { path: string } | null
    request: string
    mentionables?: readonly unknown[]
  },
) {
  if (!input.readOnly || !registry) return registry
  let native = registry.native
  if (native) {
    const host = native
    const jobs =
      peekDocumentJobHost(host)?.store.conversationJobs(
        input.conversationId ?? input.runId,
      ) ?? []
    const references = documentJobReferences(
      host.hostContext().app,
      input.request,
      input.currentFile,
      input.mentionables,
    )
    const extension = input.currentFile?.path
      .match(/\.[^.]+$/)?.[0]
      ?.toLowerCase()
    const captureRequired =
      extension &&
      host
        .editors()
        .some(
          (editor) =>
            !editor.resourceTypes.length ||
            editor.resourceTypes.includes(extension),
        )
    if (jobs.length || references !== 'none' || captureRequired)
      throw new Error(
        '[assembly_requires_provider_call] Document-job preparation or editor scope requires provider state',
      )
    // These capabilities are unavailable in the dry view; metadata accessors
    // continue using the existing host, without constructing a document store.
    native = Object.create(host) as NativeProviderHost
    Object.defineProperty(native, 'diagnostics', { value: undefined })
    Object.defineProperty(native, 'hostContext', { value: undefined })
    Object.defineProperty(native, 'editors', { value: () => [] })
  }
  const view = Object.create(registry) as ProviderRuntime
  Object.defineProperty(view, 'native', { value: native })
  Object.defineProperty(view, 'getSnapshot', {
    value: async () => registry.createSnapshot(),
  })
  return view
}

export function preparationTurnId(
  input: ReadOnlyPreparation & {
    runId: string
    reexpose?: { providerTurnId: string }
  },
) {
  return (
    input.reexpose?.providerTurnId ??
    (input.readOnly
      ? `${input.runId}:${input.now ?? ''}`
      : providerTurnIdentifier(input.runId))
  )
}
