import { toolSucceeded } from '../../core/llm/toolOutcome'
import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import type { SessionEditReceipt } from './sessionProtocol'

/** This exception cannot be used by a different provider, tool, or mode. */
export function isPlanningResolve(
  providerId: string,
  name: string,
  mode: unknown,
): boolean {
  return (
    providerId === 'hwp-hands' &&
    (name === 'plan_edits' || name === 'restyle') &&
    mode === 'resolve'
  )
}

/** Revision conflicts may name the new revision, but cannot report changes. */
export function validPlanningReceipt(
  receipt: SessionEditReceipt,
  targetRevision: number,
  isError: boolean,
  errorCode?: string,
): boolean {
  return (
    receipt.applied === 'no' &&
    receipt.changedHandles.length === 0 &&
    receipt.changedPages.length === 0 &&
    receipt.revisionAfter === receipt.revisionBefore &&
    (receipt.revisionBefore === targetRevision ||
      (isError && errorCode === 'REVISION_CONFLICT'))
  )
}

/** A resolve cannot erase a provider operation: its suffix exceeds the 128-character operationId limit. */
export function planningOutcome(
  text: string,
  key: (value: string) => string,
  digest: string,
  disclosure: AgentToolOutcome['disclosure'],
): AgentToolOutcome {
  return toolSucceeded(text, {
    mutationScope: 'none',
    mutationKey: key(`document-job-resolve:${digest}:${digest}`),
    mutationResolution: 'resolved',
    disclosure,
  })
}
