import { t } from '../../i18n'

import type { CommitRuntime } from './commitPrepare'
import type { CommitFact } from './commitStatus'
import type { HostContext } from './editorActions'
import type { OutputAnchorCapture } from './outputAnchorCapture'
import { resolveAnchorBatch } from './resolveAnchorBatch'
import {
  savedOutputAnchorLeaseView,
  savedOutputAnchorView,
} from './savedOutputAnchorView'

export type { SavedAnchorReference } from './resolveAnchorBatch'

/** User-requested page; possession never authorizes document editing. */
export async function resolveSavedAnchorRefs(
  host: HostContext,
  runtime: CommitRuntime | undefined,
  capture: OutputAnchorCapture | undefined,
  fact: CommitFact,
  conversationId: string,
  offset: number,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 50 !== 0)
    throw new Error(
      t('ui.resolveSavedAnchorRefs.invalidParagraphLocationRange'),
    )
  const generation = capture?.requested(conversationId)
  return resolveAnchorBatch({
    host,
    fact,
    signal,
    observe: () =>
      savedOutputAnchorView(runtime, capture, fact, conversationId),
    scopeCurrent: () =>
      !!generation && capture?.requested(conversationId) === generation,
    select: (pages) =>
      pages.flatMap((page) => page.anchors).slice(offset, offset + 50),
  })
}

/** Host-only arbitrary selection from a live lease bound to this saved checkpoint. */
export async function resolveHostAnchorRefs(
  host: HostContext,
  runtime: CommitRuntime,
  capture: OutputAnchorCapture,
  fact: CommitFact,
  conversationId: string,
  leaseId: string,
  indices: readonly number[],
  signal?: AbortSignal,
) {
  if (
    !indices.length ||
    indices.length > 50 ||
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isSafeInteger(index) || index < 0)
  )
    throw new Error('Invalid host anchor selection.')
  return resolveAnchorBatch({
    host,
    fact,
    signal,
    observe: () =>
      savedOutputAnchorLeaseView(
        runtime,
        capture,
        fact,
        conversationId,
        leaseId,
      ),
    scopeCurrent: () =>
      capture.leaseCurrent(leaseId, conversationId, fact.runId),
    select: (pages) => {
      if (pages.some((page) => page.version === 'saved-output-anchors/0.1'))
        throw new Error('Applied markers unavailable.')
      const byIndex = new Map(
        pages
          .flatMap((page) => page.anchors)
          .map((anchor) => [anchor.blockIndex, anchor]),
      )
      return indices.map((index) => {
        const anchor = byIndex.get(index)
        if (!anchor) throw new Error('Anchor is not in this lease.')
        return anchor
      })
    },
  })
}
