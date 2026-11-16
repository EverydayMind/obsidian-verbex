import { dialectProblem } from '../../core/document-jobs/decompose/dialectPolicy'
import type { TemplateBinding } from '../../core/document-jobs/decompose/jobDecomposition'
import type { DocumentJobStore } from '../../core/document-jobs/jobStore'
import type { FormatJob } from '../../core/document-jobs/jobTypes'

import {
  decompositionFrontmatter,
  inspectDecompositionPair,
} from './decompositionPair'
import { templateDialectChanged } from './documentJobGuardText'
import { jobStatusResult } from './documentJobStatus'
import type { HostContext } from './editorActions'
import type { JsonObject } from './protocol'

export function blockJobDialect(
  store: DocumentJobStore,
  job: FormatJob,
  problem: { reason: string; details: JsonObject },
) {
  return jobStatusResult(
    store.transition(job.id, job.conversationId, job.sampleSha256, {
      state: 'blocked',
      ...problem,
      details: {
        ...problem.details,
        ...(job.status.state === 'ready' && job.status.data.template
          ? { template_path: job.status.data.template.path }
          : {}),
      },
    }),
  )
}
export function draftDialectProblem(
  bytes: ArrayBuffer,
  dialect: unknown,
  authority: 'record' | 'bundle' = 'bundle',
) {
  const meta = decompositionFrontmatter(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  )
  return dialectProblem(
    meta['hwpx-dialect'],
    typeof dialect === 'string' ? dialect : null,
    authority,
  )
}

export function templateDialectProblem(
  bytes: ArrayBuffer,
  preparedDialect: string | null,
  currentDialect: string | null,
): ReturnType<typeof dialectProblem> {
  if (preparedDialect !== currentDialect)
    return {
      reason: 'template_dialect_changed',
      details: {
        template_dialect_changed: [{ preparedDialect, currentDialect }],
        action: templateDialectChanged(),
      },
    }
  return draftDialectProblem(bytes, currentDialect, 'record')
}

export async function inspectTemplateDialect(
  host: HostContext,
  template: TemplateBinding,
  bytes: ArrayBuffer,
  signal?: AbortSignal,
) {
  const pair = await inspectDecompositionPair(host, template.path, signal)
  return {
    pair,
    problem: templateDialectProblem(
      bytes,
      template.dialect ?? null,
      pair.record?.dialect ?? null,
    ),
  }
}
