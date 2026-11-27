import { App } from 'obsidian'

import { t } from '../../../i18n'
import { VerbexSettings } from '../../../settings/schema/setting.types'

import { documentQueue } from './extractionQueue'
import { resolveExtractionSource } from './extractionSources'
import { isDocumentPath, listIndexableSources } from './indexableSources'

const EXTENSIONS = ['.hwp', '.hwpx', '.pdf']

/** One readable line per extension: where its text comes from. */
export function extractionSourceLines(app: App): Record<string, string> {
  const lines: Record<string, string> = {}
  for (const extension of EXTENSIONS) {
    const { source, approvalNeeded } = resolveExtractionSource(app, extension)
    const names = (items: { name: string }[]) =>
      items.map((item) => item.name).join(', ')
    const parts: string[] = []
    if (source.kind === 'provider') parts.push(source.name)
    else if (source.kind === 'legacy')
      parts.push(t('documentSources.legacyKordoc'))
    else if (source.kind === 'conflict')
      parts.push(
        t('documentSources.conflict', { providers: names(source.providers) }),
      )
    else if (!approvalNeeded.length) parts.push(t('documentSources.none'))
    if (approvalNeeded.length)
      parts.push(
        t('documentSources.approvalNeeded', {
          providers: names(approvalNeeded),
        }),
      )
    lines[extension] = parts.join(' · ')
  }
  return lines
}

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
    sources: extractionSourceLines(app),
    ocrCandidates,
    progress: queue.progress,
    lastReconcile: queue.lastReconcile,
  }
}
