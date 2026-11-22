import { TFile } from 'obsidian'

import { MD_DIALECT_V2 } from '../../core/document-jobs/decompose/dialectV2'
import {
  bindingLines,
  locateDraftFrontmatter,
} from '../../core/document-jobs/draftFrontmatter'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { documentJobNextStep, readProduceDraft } from './documentJobDraftInput'
import { unboundDraftMessage } from './documentJobDraftText'
import type { HostContext } from './editorActions'

/** Same canonical userPath constraints as Exporter's deriveProvider. */
export function exporterUserPath(value: string): string | null {
  return !value ||
    [...value].length > 4096 ||
    /^(?:[A-Za-z]:|\/)/.test(value) ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 92,
    ) ||
    value.split('/').some((part) => !part || part.startsWith('.'))
    ? null
    : value
}

export function exporterTemplateLink(
  host: HostContext,
  value: unknown,
  draftPath: string,
): TFile | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim(),
    wiki = /^\[\[([^[\]]+)\]\]$/.exec(trimmed)
  let path: string | null
  if (wiki) {
    if (!exporterUserPath(wiki[1])) return null
    path =
      host.app.metadataCache.getFirstLinkpathDest(wiki[1], draftPath)?.path ??
      null
  } else {
    if (!exporterUserPath(trimmed)) return null
    path = [...draftPath.split('/').slice(0, -1), trimmed].join('/')
  }
  if (!path || !exporterUserPath(path) || !/\.hwpx$/i.test(path)) return null
  const file = host.app.vault.getAbstractFileByPath(path)
  return file instanceof TFile ? file : null
}

export function expectedDraftBinding(
  host: HostContext,
  job: FormatJob,
  draftPath: string,
) {
  if (job.status.state !== 'ready' || !job.status.data.template) return null
  const template = job.status.data.template
  const file = host.app.vault.getAbstractFileByPath(template.path)
  if (!(file instanceof TFile)) return null
  const short = host.app.metadataCache.fileToLinktext(file, draftPath)
  for (const link of [short, file.path]) {
    const value = `[[${link}]]`
    if (exporterTemplateLink(host, value, draftPath) === file)
      return {
        'hwpx-dialect': template.dialect ?? MD_DIALECT_V2,
        'hwpx-template': value,
      }
  }
  return null
}

export function inspectDraftTemplateBinding(
  host: HostContext,
  job: FormatJob,
  draftPath: string,
  text: string,
) {
  const found = locateDraftFrontmatter(text)
  if (found.state === 'absent')
    return { reason: 'frontmatter_missing', found: null }
  if (found.state === 'unsupported')
    return { reason: 'frontmatter_unsupported', found: null }
  const value = found.values['hwpx-template']
  if (value === undefined)
    return { reason: 'template_key_missing', found: null }
  const file = exporterTemplateLink(host, value, draftPath)
  if (!file)
    return {
      reason: 'template_unresolved',
      found: typeof value === 'string' ? value : null,
    }
  const template =
    job.status.state === 'ready' ? job.status.data.template : undefined
  return {
    reason:
      file === host.app.vault.getAbstractFileByPath(template?.path ?? '')
        ? null
        : 'template_other',
    found: typeof value === 'string' ? value : null,
  }
}

export function draftTemplateBindingFact(
  host: HostContext,
  job: FormatJob,
  request: { draft_path: string; output_path: string },
  bytes: ArrayBuffer,
) {
  const draftPath = request.draft_path
  const binding = inspectDraftTemplateBinding(
    host,
    job,
    draftPath,
    new TextDecoder().decode(bytes),
  )
  if (!binding.reason) return null
  const nextStep = documentJobNextStep(job)
  nextStep.arguments = { ...nextStep.arguments, ...request }
  const expected = expectedDraftBinding(host, job, draftPath)
  return {
    state: 'draft_template_unbound',
    draft_path: draftPath,
    ...binding,
    ...(!expected ? { reason: 'template_unresolved' } : {}),
    ...(expected
      ? { expected, expected_lines: bindingLines(expected) }
      : {
          template_path:
            job.status.state === 'ready'
              ? (job.status.data.template?.path ?? '')
              : '',
        }),
    nextStep,
    message: unboundDraftMessage(binding.reason === 'frontmatter_unsupported'),
  }
}

export async function readBoundTemplateDraft(
  host: HostContext,
  request: { draft_path: string; output_path: string },
  job: FormatJob,
) {
  const draft = await readProduceDraft(host, request, job)
  if ('fact' in draft) return draft
  const fact = draftTemplateBindingFact(host, job, request, draft.bytes)
  return fact ? { fact } : draft
}
