import type { FormatJob } from '../../core/document-jobs/jobTypes'
import { canonicalDigest } from '../../security/promptInjectionBoundary'

import { decompositionStatusFacts } from './decompositionResultFacts'
import { documentJobNextStep } from './documentJobDraftInput'
import type { HostContext } from './editorActions'
import type { JsonObject } from './protocol'

export async function pendingContractDigest(
  contract: unknown,
  signal?: AbortSignal,
): Promise<string | undefined> {
  try {
    return await canonicalDigest(contract)
  } catch {
    signal?.throwIfAborted()
    // Digest failure must not suppress the contract.
    return undefined
  }
}

export async function pendingContractFacts(
  contract: JsonObject,
  signal?: AbortSignal,
) {
  const digest = await pendingContractDigest(contract, signal)
  return {
    draft_contract: contract,
    ...(digest ? { draft_contract_sha256: digest } : {}),
  }
}

export async function pendingDraftExists(
  context: HostContext,
  path: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const exists = (await context.app.vault.adapter.stat(path))?.type === 'file'
    signal?.throwIfAborted()
    return exists
  } catch {
    signal?.throwIfAborted()
    return false
  }
}

export function pendingNextStep(job: FormatJob, exists: boolean) {
  return exists
    ? {
        tool: 'produce_format_reuse',
        arguments: documentJobNextStep(job).arguments,
      }
    : decompositionStatusFacts(job).nextStep
}
