import {
  bindDraftFrontmatter,
  locateDraftFrontmatter,
} from '../../core/document-jobs/draftFrontmatter'
import { validDocumentJobs } from '../../core/document-jobs/validJobs'
import type { LocalChangePreparer } from '../../core/tools/localChangePreparation'
import { isDestructiveWrite } from '../../permissions/PermissionManager'

import {
  eligibleDocumentWrite,
  explicitCandidates,
} from './documentJobExplicitScope'
import { documentJobFileBytes } from './documentJobFileHash'
import { documentJobHost } from './documentJobHost'
import { documentJobOverlapFact } from './documentJobOverlapFact'
import { findDraftJob, otherDraftFact } from './documentJobWriteFacts'
import * as wording from './documentJobWritePreparerText'
import {
  expectedDraftBinding,
  inspectDraftTemplateBinding,
} from './draftTemplateBinding'
import type { NativeProviderHost } from './NativeProviderHost'

export function documentJobWritePreparer(
  host?: NativeProviderHost,
  trigger?: 'explicit' | 'structural',
  explicitJobIds?: readonly string[],
): LocalChangePreparer {
  return async ({ change, conversationId, signal }) => {
    if (!host || !conversationId || !eligibleDocumentWrite(change)) return
    const context = host.hostContext(),
      service = documentJobHost(host)
    let aborted: Error | undefined
    const jobs = await validDocumentJobs({
      store: service.store,
      conversationId,
      hash: async (path) => {
        try {
          return await service.byteHash(path)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError')
            aborted = error
          throw error
        }
      },
      signal,
    })
    if (aborted) throw aborted
    signal?.throwIfAborted()
    const match = await findDraftJob(context.app, jobs, change.path)
    if (match.ambiguous) return
    const job = match.job
    if (!job)
      return trigger === 'explicit' || explicitJobIds?.length
        ? {
            change,
            afterApply: async (status) =>
              status === 'applied'
                ? otherDraftFact(
                    context.app,
                    service.store,
                    explicitCandidates(jobs, trigger, explicitJobIds),
                    change.path,
                    signal,
                  )
                : undefined,
          }
        : undefined
    if (job.status.state !== 'ready') return
    const values =
      job.kind === 'template' && !isDestructiveWrite(change)
        ? expectedDraftBinding(context, job, change.path)
        : undefined
    if (!values)
      return {
        change,
        afterApply: async () =>
          documentJobOverlapFact(context, job, change.path, signal),
      }
    const edited = bindDraftFrontmatter(change.after, values)
    const note = wording.note(job.status.data.template?.path ?? '')
    const updated = edited.state === 'inserted' || edited.state === 'updated'
    return {
      change: updated
        ? {
            ...change,
            after: edited.text,
            approvalNotes: [...(change.approvalNotes ?? []), note],
          }
        : change,
      afterApply: async (status) => {
        let binding = 'unavailable',
          missing: string[] = []
        try {
          const text = new TextDecoder().decode(
            await documentJobFileBytes(context, change.path),
          )
          signal?.throwIfAborted()
          const fm = locateDraftFrontmatter(text)
          binding =
            !inspectDraftTemplateBinding(context, job, change.path, text)
              .reason &&
            fm.state === 'simple' &&
            fm.values['hwpx-dialect'] === values['hwpx-dialect']
              ? 'bound'
              : 'unbound'
          const meta =
            job.status.state === 'ready'
              ? job.status.data.draftContract.meta_keys
              : undefined
          if (Array.isArray(meta))
            missing = meta.filter(
              (key): key is string =>
                typeof key === 'string' &&
                (fm.state !== 'simple' ||
                  !Object.prototype.hasOwnProperty.call(fm.values, key)),
            )
        } catch {
          signal?.throwIfAborted()
        }
        const structure = await documentJobOverlapFact(
          context,
          job,
          change.path,
          signal,
        )
        const text = [
          updated
            ? note.replace('frontmatter', wording.approvalFrontmatter())
            : '',
          wording.approvalResult(status, binding),
          edited.state === 'unsupported'
            ? wording.unsupported(edited.reason ?? 'frontmatter_unsupported')
            : '',
          ...missing.map((key) => wording.missingMeta(key)),
          typeof structure === 'string' ? structure : structure.text,
        ]
          .filter(Boolean)
          .join('\n')
        return {
          text,
          observation:
            typeof structure === 'string' ? undefined : structure.observation,
        }
      },
    }
  }
}
