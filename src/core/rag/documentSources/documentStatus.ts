import { App } from 'obsidian'

import { VerbexSettings } from '../../../settings/schema/setting.types'

import { documentQueue } from './extractionQueue'
import { isDocumentPath, listIndexableSources } from './indexableSources'

export async function documentStatus(app: App, settings: VerbexSettings) {
  const queue = documentQueue(app)
  const formats: Record<string, number> = {}
  const ocrCandidates: { path: string; pages: number[] }[] = []
  for (const file of listIndexableSources(app, settings)) {
    if (!isDocumentPath(file.path)) continue
    formats[file.extension] = (formats[file.extension] ?? 0) + 1
    const p = await queue.store.read(file.path)
    if (p?.status === 'needs_ocr' || p?.quality?.ocrCandidatePages.length)
      ocrCandidates.push({
        path: file.path,
        pages: p.quality?.ocrCandidatePages ?? [],
      })
  }
  return {
    formats,
    ocrCandidates,
    progress: queue.progress,
    lastReconcile: queue.lastReconcile,
  }
}
