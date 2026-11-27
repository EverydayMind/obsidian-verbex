import { App, TFile } from 'obsidian'

import { createHash } from '../../../platform/node/api'

import { type SourceIdentity, strictMatch } from './extractionIdentity'
import { DocumentProjection } from './types'

/** Only the background extraction owner fingerprints binary bytes. */
export async function fingerprintDocument(
  app: App,
  file: TFile,
): Promise<string> {
  const bytes = await app.vault.readBinary(file)
  return createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
}

export function relocateProjection(
  previous: DocumentProjection,
  path: string,
  stamp = previous.sourceStamp,
): DocumentProjection {
  const lines = previous.projection.split('\n')
  const oldName = previous.path.split('/').pop() ?? previous.path
  const newName = path.split('/').pop() ?? path
  for (const chunk of previous.chunks) {
    const index = chunk.startLine - 1
    lines[index] = `[${newName}${lines[index].slice(oldName.length + 1)}`
  }
  return { ...previous, path, sourceStamp: stamp, projection: lines.join('\n') }
}

export function reusableProjection(
  candidate: DocumentProjection | undefined,
  identity: SourceIdentity | undefined,
  chunkSize: number,
  force: boolean,
  ocr: 'off' | 'candidates',
): candidate is DocumentProjection {
  const compatible =
    !identity || (!!candidate && strictMatch(candidate, identity))
  return (
    !!candidate &&
    (candidate.chunkSize === chunkSize || !!candidate.extractor?.ocrApplied) &&
    ocr === 'off' &&
    (!!candidate.extractor?.ocrApplied ||
      (!force && compatible && candidate.status !== 'extractor_unavailable'))
  )
}
