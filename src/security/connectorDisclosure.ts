import type { RequestMessage } from '../types/llm/request'

import type { DisclosureSegment } from './promptInjectionBoundary'

/** Host-authored provenance accompanies every connector tool response. */
export function connectorDisclosureSegments(
  messages: readonly RequestMessage[],
): DisclosureSegment[] | undefined {
  if (
    !messages.some((message) => 'disclosure' in message && message.disclosure)
  )
    return undefined
  return messages.map((message) => {
    const provenance = 'disclosure' in message ? message.disclosure : undefined
    const content = JSON.stringify(message)
    return {
      level: 'content',
      origins: provenance
        ? [
            ...new Set([
              provenance.connectorId,
              ...(provenance.sourceConnectorIds ?? []),
            ]),
          ].map((id) => `connector:${id}`)
        : ['prompt-envelope'],
      canonicalVaultPaths: provenance?.canonicalVaultPaths ?? [],
      unattributedFiles: provenance?.unattributedFiles ?? 0,
      content,
      measuredBytes: new TextEncoder().encode(content).byteLength,
    }
  })
}
