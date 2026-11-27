import type {
  ExtractProviderInfo,
  ExtractionHost,
} from '../../../core/rag/documentSources/extractionSources'
import type { IndexTextResult } from '../../../core/rag/documentSources/types'
import type { ProviderCurrentCause } from '../currentProvider'
import { readDataMember } from '../descriptorReader'
import type { HostContext } from '../editorActions'
import type { Discovered } from '../hostScanTypes'

import { parseExtractTextResult } from './extractText'

export const EXTRACT_MAX_CHARS = 2_000_000

const APPROVAL_CAUSES: readonly ProviderCurrentCause[] = [
  'pending',
  'reapproval',
  'disabled',
]

function causeOf(
  host: HostContext,
  id: string,
): ProviderCurrentCause | undefined {
  return (
    host.currentProviderCause?.(id) ??
    (host.isCurrent(id) ? undefined : 'instance_changed')
  )
}

const unavailable = (message: string): IndexTextResult => ({
  status: 'extractor_unavailable',
  message,
})

/**
 * Document text from providers that declared `extractText`
 * (host-capabilities-v1 section 3). Only an approved, active and current
 * provider is called, never while another call holds the provider busy lock
 * (no lock is taken here), and a result is discarded when the live instance
 * changed while it was running.
 */
export function nativeExtractionHost(
  context: () => HostContext,
  providerIds: () => string[],
): ExtractionHost {
  return {
    providers() {
      const host = context()
      const list: ExtractProviderInfo[] = []
      for (const id of providerIds()) {
        const found = host.getActiveDiscovered(id) as Discovered | undefined
        if (!found?.extractText) continue
        const cause = causeOf(host, id)
        list.push({
          pluginId: id,
          name: found.descriptor?.provider.name ?? id,
          extensions: found.extractText.extensions,
          extractorVersion: found.extractText.extractorVersion,
          state:
            cause === undefined
              ? 'current'
              : APPROVAL_CAUSES.includes(cause)
                ? 'approval_needed'
                : 'unavailable',
        })
      }
      return list
    },
    async extract(id, request) {
      const host = context()
      const found = host.getActiveDiscovered(id) as Discovered | undefined
      const facts = found?.extractText
      if (!found || !facts || causeOf(host, id))
        return unavailable('Provider is not approved, active and current')
      const same = () => {
        const latest = host.getActiveDiscovered(id)
        return (
          !!latest &&
          latest.handle.provider === found.handle.provider &&
          latest.digest === found.digest &&
          !causeOf(host, id)
        )
      }
      let raw: unknown
      try {
        const member = readDataMember(
          found.hostMembers?.receiver ?? {},
          'extractText',
        )
        const extract = readDataMember(member as object, 'extract')
        if (typeof extract !== 'function')
          return unavailable('extractText.extract is not a function')
        raw = await Promise.resolve().then(() => {
          const result: unknown = Reflect.apply(extract, member, [
            {
              path: request.path,
              signal: request.signal,
              ocr: request.ocr,
              maxChars: EXTRACT_MAX_CHARS,
            },
          ])
          return result
        })
      } catch {
        if (!same()) return unavailable('Provider changed during extraction')
        return { status: 'corrupted', message: 'Extraction failed' }
      }
      if (!same()) return unavailable('Provider changed during extraction')
      const judged = parseExtractTextResult(
        raw,
        facts.extractorVersion,
        EXTRACT_MAX_CHARS,
      )
      return judged.ok
        ? judged.value
        : { status: 'corrupted', message: 'Invalid extraction result' }
    },
  }
}
