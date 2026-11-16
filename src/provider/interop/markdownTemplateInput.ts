import { RULES } from '../../core/document-jobs/decompose/types'
import { SHA } from '../../core/document-jobs/jobTypes'

import { decompositionFrontmatter } from './decompositionPair'
import { documentJobFileBytes } from './documentJobFileHash'
import type { HostContext } from './editorActions'

/** Retired Markdown remains identifiable when its paired template is missing. */
export async function markdownTemplateInput(host: HostContext, path: string) {
  const bytes = await documentJobFileBytes(host, path, RULES.textBytes)
  const supplied = decompositionFrontmatter(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  )
  const retired = supplied['hwpx-dialect'] === 'hwpx-exporter-md/1'
  if (
    typeof supplied['hwpx-decomposition'] !== 'string' ||
    !SHA.test(supplied['hwpx-decomposition'])
  ) {
    return retired ? { supplied, retired, templatePath: '' } : null
  }
  const link = supplied['hwpx-template']
  if (typeof link !== 'string') {
    if (retired) return { supplied, retired, templatePath: '' }
    throw new Error('Decomposition template link missing.')
  }
  const wiki = link.match(/^\[\[([^\]|#]+)\]\]$/)
  const templatePath = wiki
    ? (host.app.metadataCache.getFirstLinkpathDest(wiki[1], path)?.path ?? '')
    : [...path.split('/').slice(0, -1), link].join('/')
  if (!templatePath && !retired)
    throw new Error('Decomposition template unavailable.')
  return { supplied, retired, templatePath }
}
