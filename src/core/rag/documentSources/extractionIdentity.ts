import { KORDOC_PROVIDER_ID } from '../../../provider/contract'

import type { DocumentProjection } from './types'

/** Who produced a projection and with which engine and chunker. */
export type SourceIdentity = {
  pluginId: string
  extractorId: string
  engineVersion: string
  chunkerVersion: string
}

/**
 * The owning plugin of a stored projection. Projections written before the
 * plugin id was stored came only from the KorDoc Transform `api.indexText`
 * path, so extractor id `kordoc` is read as that plugin's (one interpretation,
 * no re-extraction). This is the only place that names the plugin in code for
 * this purpose; remove it together with the legacy `api.indexText` fallback.
 */
export function projectionPluginId(
  p: Pick<DocumentProjection, 'extractor' | 'pluginId'>,
): string | undefined {
  if (p.pluginId) return p.pluginId
  return p.extractor?.id === 'kordoc' ? KORDOC_PROVIDER_ID : undefined
}

/**
 * True when a stored projection may be reused for a source. An unknown source
 * identity or a projection without an extractor (a recorded failure) matches,
 * as before; otherwise plugin, extractor id and both versions must be equal.
 */
export function identityMatches(
  p: Pick<DocumentProjection, 'extractor' | 'pluginId'>,
  identity: SourceIdentity | undefined,
): boolean {
  if (!identity || !p.extractor) return true
  return strictMatch(p, identity)
}

export function strictMatch(
  p: Pick<DocumentProjection, 'extractor' | 'pluginId'>,
  identity: SourceIdentity,
): boolean {
  return (
    !!p.extractor &&
    projectionPluginId(p) === identity.pluginId &&
    p.extractor.id === identity.extractorId &&
    p.extractor.engineVersion === identity.engineVersion &&
    p.extractor.chunkerVersion === identity.chunkerVersion
  )
}

/** The previous projection came from this plugin with the same extractor. */
export function sameSource(
  previous: Pick<DocumentProjection, 'extractor' | 'pluginId'>,
  extractor: DocumentProjection['extractor'],
  pluginId: string | undefined,
): boolean {
  const current = previous.extractor
  return (
    !!current &&
    !!extractor &&
    projectionPluginId(previous) === pluginId &&
    current.id === extractor.id &&
    current.engineVersion === extractor.engineVersion &&
    current.chunkerVersion === extractor.chunkerVersion &&
    current.ocrApplied === extractor.ocrApplied
  )
}

/** Records the source on a projection about to be stored. */
export function stampSource(
  projection: DocumentProjection,
  pluginId: string | undefined,
  identity: SourceIdentity | undefined,
): void {
  if (!projection.extractor && identity)
    projection.extractor = {
      id: identity.extractorId,
      engineVersion: identity.engineVersion,
      chunkerVersion: identity.chunkerVersion,
      ocrApplied: false,
    }
  if (pluginId) projection.pluginId = pluginId
  else delete projection.pluginId
}
