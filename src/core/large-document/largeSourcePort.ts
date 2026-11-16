import { App, TFile } from 'obsidian'

import { isBinaryDocumentFile } from '../../context/agentSourcePolicy'
import { createHash } from '../../platform/node/api'
import { extractorKey } from '../rag/documentSources/projection'
import { SourceTextReader } from '../rag/sourceTextReader'

/** Coverage facts of a disk projection: lines are projection lines, not pages. */
export type ProjectionCoverage = {
  revision: string
  schemaVersion: number
  pageMode: 'layout' | 'section' | null
  /** Extraction stopped early, so a whole digest cannot cover the original. */
  truncated: boolean
}

export type LargeSource = {
  text: string
  revision: string
  /** Digest cache identity: source revision plus extractor for projections. */
  identity: string
  projection?: ProjectionCoverage
}

/**
 * Binary documents are read only through a ready disk projection (never
 * cachedRead, never on-demand extraction); unavailable projections throw so
 * callers keep the bounded excerpt/state path.
 */
export async function readLargeSource(
  app: App,
  file: TFile,
): Promise<LargeSource> {
  if (isBinaryDocumentFile(file)) {
    const source = await new SourceTextReader(app).read(file.path)
    if (!source?.document) throw new Error('Document projection unavailable')
    const p = source.document
    return {
      text: source.text,
      revision: source.revision,
      identity: `${source.revision}:${extractorKey(p)}`,
      projection: {
        revision: source.revision,
        schemaVersion: p.schemaVersion,
        pageMode: p.pageMode,
        truncated: p.truncated,
      },
    }
  }
  const text = await app.vault.cachedRead(file)
  const revision = createHash('sha256').update(text).digest('hex')
  return { text, revision, identity: revision }
}
