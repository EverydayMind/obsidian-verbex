import { App } from 'obsidian'

import { createHash } from '../../platform/node/api'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'

import { documentQueue } from './documentSources/extractionQueue'
import {
  documentSettings,
  isDocumentPath,
  isGeneratedSidecar,
  shouldIndexSource,
} from './documentSources/indexableSources'
import { kordocIndexApi } from './documentSources/kordocIndexText'
import { DocumentProjection } from './documentSources/types'

export type SourceText = {
  kind: 'markdown' | 'document'
  text: string
  revision: string
  document?: DocumentProjection
}

/** Retrieval never extracts on demand and never reads binary source bytes. */
export class SourceTextReader {
  constructor(private app: App) {}
  async read(path: string): Promise<SourceText | null> {
    const file = this.app.vault.getFileByPath?.(path)
    if (!file || isAiPrivatePath(file.path)) return null
    const queue = documentQueue(this.app)
    if (file.extension === 'md') {
      if (await isGeneratedSidecar(this.app, file, queue.settings)) return null
      const text = await this.app.vault.cachedRead(file)
      return {
        kind: 'markdown',
        text,
        revision: createHash('sha256').update(text).digest('hex'),
      }
    }
    const status = await this.inspectDocument(path)
    if (status.state !== 'ready') return null
    const p = status.projection
    return {
      kind: 'document',
      text: p.projection,
      revision: p.sourceSha256,
      document: p,
    }
  }

  async inspectDocument(path: string): Promise<DocumentReadStatus> {
    const file = this.app.vault.getFileByPath?.(path)
    if (!file) return { state: 'missing' }
    if (!isDocumentPath(path)) return { state: 'unsupported' }
    const queue = documentQueue(this.app)
    if (!documentSettings(queue.settings).enabled) return { state: 'disabled' }
    if (!shouldIndexSource(file, queue.settings)) return { state: 'excluded' }
    const p = await queue.store.read(path)
    if (!p) return { state: 'missing_projection' }
    if (
      p.sourceStamp.mtime !== file.stat.mtime ||
      p.sourceStamp.size !== file.stat.size
    )
      return { state: 'stale' }
    if (p.status !== 'ok')
      return {
        state: p.status === 'needs_ocr' ? 'needs_ocr' : 'extraction_failed',
        failure: p.status,
      }
    const version = kordocIndexApi(this.app)?.indexTextExtractor
    if (
      version &&
      !p.extractor?.ocrApplied &&
      (version.engineVersion !== p.extractor?.engineVersion ||
        version.chunkerVersion !== p.extractor?.chunkerVersion)
    )
      return { state: 'stale' }
    return {
      state: 'ready',
      projection: p,
      version: version ? 'verified' : 'unverified',
    }
  }
}

export type DocumentReadStatus =
  | {
      state: 'ready'
      projection: DocumentProjection
      version: 'verified' | 'unverified'
    }
  | {
      state:
        | 'missing'
        | 'unsupported'
        | 'disabled'
        | 'excluded'
        | 'missing_projection'
        | 'stale'
        | 'needs_ocr'
        | 'extraction_failed'
      failure?: string
    }
