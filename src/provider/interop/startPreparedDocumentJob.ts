import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import { startFormatJob } from '../../core/document-jobs/startFormatJob'
import { getStyleApi } from '../../core/report-style/kordocStyleApi'

import { documentJobFileHash } from './documentJobFileHash'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import { prepareTemplateJob } from './prepareTemplateJob'

export async function startPreparedDocumentJob(input: {
  host: HostContext
  options: NativeHostOptions
  store: DocumentJobStore
  request: { sample_path: string; output_name?: string; base_font_pt?: number }
  conversationId: string
  baseFontPt: number
  signal?: AbortSignal
}) {
  const { host, options, store, request, conversationId, signal } = input
  const template = await prepareTemplateJob({
    host,
    options,
    store,
    path: request.sample_path,
    outputName: request.output_name,
    conversationId,
    signal,
  })
  return (
    template ??
    startFormatJob({
      store,
      conversationId,
      samplePath: request.sample_path,
      outputName: request.output_name,
      requestedBaseFontPt: request.base_font_pt ?? input.baseFontPt,
      baseSource: request.base_font_pt === undefined ? 'setting' : 'request',
      validatePath: host.vaultPath,
      byteHash: (path) => documentJobFileHash(host, host.vaultPath(path)),
      api: () => getStyleApi(host.app),
      signal,
    })
  )
}
