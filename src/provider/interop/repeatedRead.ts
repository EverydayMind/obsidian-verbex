import { canonicalDigest } from '../../security/promptInjectionBoundary'

import type { ObservationLedger } from './observationLedger'
import type { JsonObject } from './protocol'
import type { NativeToolResult } from './resultReader'

/** Adds no cache: the provider already ran, and only a complete identical read qualifies. */
export async function repeatedRead(
  ledger: ObservationLedger | undefined,
  result: NativeToolResult,
  input: {
    providerId: string
    digest: string
    generation: number
    name: string
    toolName: string
    args: JsonObject
    vaultEvents: boolean
  },
): Promise<boolean> {
  const { args } = input
  const page = result.documentRead?.page
  const resource = result.meta['dev.agentinterop/resource']
  const validResource =
    resource &&
    typeof resource === 'object' &&
    !Array.isArray(resource) &&
    typeof resource.sessionId === 'string' &&
    typeof resource.documentEpoch === 'string' &&
    typeof resource.revision === 'number'
  const complete =
    input.toolName === 'read_document' &&
    (args.mode === undefined || args.mode === 'blocks') &&
    args.cursor === undefined &&
    args.limit === undefined &&
    !result.isError &&
    !result.truncated &&
    !input.vaultEvents &&
    result.documentRead?.state === 'page' &&
    page &&
    page.from <= 1 &&
    !page.hasMore &&
    page.contentComplete &&
    validResource
  if (!complete || !ledger) {
    ledger?.invalidateRepeatedRead()
    return false
  }
  const identity = await canonicalDigest({ ...input, resource, page })
  return ledger.repeatedRead(identity, result.text)
}
