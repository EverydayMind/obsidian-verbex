import type { DocumentJobStore } from '../../core/document-jobs/jobStore'

import type { HostContext } from './editorActions'

/** Only validated, existing user paths can be offered as recovery sources. */
export async function retiredTemplateJob(input: {
  host: HostContext
  store: DocumentJobStore
  conversationId: string
  path: string
  sha256: string
  templatePath: string
  source?: string
  signal?: AbortSignal
}) {
  const { host, source, signal, store } = input
  let sourcePath: string | undefined
  if (
    source &&
    !/^(?:[A-Za-z]:|\/)/.test(source) &&
    !source.includes('\\') &&
    ![...source].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
    !source.split('/').some((p) => !p || p.startsWith('.'))
  ) {
    try {
      if (
        host.vaultPath(source) === source &&
        (await host.app.vault.adapter.stat(source))?.type === 'file'
      )
        sourcePath = source
    } catch {
      signal?.throwIfAborted()
    }
  }
  signal?.throwIfAborted()
  const job = store.createJob({
    conversationId: input.conversationId,
    kind: 'template',
    samplePath: input.path,
    sampleSha256: input.sha256,
    apiVersion: 1,
  })
  return store.transition(job.id, job.conversationId, job.sampleSha256, {
    state: 'blocked',
    reason: 'decomposition_dialect_retired',
    details: {
      template_path: input.templatePath,
      sourceAvailable: !!sourcePath,
      ...(sourcePath ? { sourcePath } : {}),
    },
  })
}
