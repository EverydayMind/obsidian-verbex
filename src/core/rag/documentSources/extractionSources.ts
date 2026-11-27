import type { App } from 'obsidian'

import { KORDOC_PROVIDER_ID } from '../../../provider/contract'

import type { SourceIdentity } from './extractionIdentity'
import { extractIndexText, kordocIndexApi } from './kordocIndexText'
import type { IndexTextResult } from './types'

/** What the document index knows about one provider that declared extractText. */
export type ExtractProviderInfo = {
  pluginId: string
  name: string
  extensions: readonly string[]
  extractorVersion: {
    id: string
    engineVersion: string
    chunkerVersion: string
  }
  /** current: approved, active and the live instance. */
  state: 'current' | 'approval_needed' | 'unavailable'
}

export type ExtractionHost = {
  providers(): ExtractProviderInfo[]
  extract(
    pluginId: string,
    request: { path: string; signal: AbortSignal; ocr: 'off' | 'candidates' },
  ): Promise<IndexTextResult>
}

const hosts = new WeakMap<App, ExtractionHost>()
/** The plugin registers (and on unload removes) its provider-backed host. */
export function setExtractionHost(app: App, host: ExtractionHost | undefined) {
  if (host) hosts.set(app, host)
  else hosts.delete(app)
}

type ProviderRef = { pluginId: string; name: string }
export type ExtractionSource =
  | ({ kind: 'provider'; identity: SourceIdentity } & ProviderRef)
  | { kind: 'legacy'; identity?: SourceIdentity }
  | { kind: 'conflict'; providers: ProviderRef[] }
  | { kind: 'none' }
export type ResolvedSource = {
  extension: string
  source: ExtractionSource
  /** Providers that declared the extension but are not approved and current. */
  approvalNeeded: ProviderRef[]
}

export function documentExtension(pathOrExtension: string): string {
  const match = /(?:^|\.)([^./\\]+)$/.exec(pathOrExtension)
  return `.${(match?.[1] ?? '').toLowerCase()}`
}

/**
 * Decides where the text of one extension comes from: exactly one current
 * provider declaring it, a conflict when several do, or (transition) the
 * KorDoc Transform `api.indexText` v1 when none does.
 */
export function resolveExtractionSource(
  app: App,
  pathOrExtension: string,
): ResolvedSource {
  const extension = documentExtension(pathOrExtension)
  const declared = (hosts.get(app)?.providers() ?? []).filter((item) =>
    item.extensions.some((value) => value.toLowerCase() === extension),
  )
  const ref = (item: ExtractProviderInfo) => ({
    pluginId: item.pluginId,
    name: item.name,
  })
  const current = declared.filter((item) => item.state === 'current')
  const approvalNeeded = declared
    .filter((item) => item.state === 'approval_needed')
    .map(ref)
  if (current.length > 1)
    return {
      extension,
      approvalNeeded,
      source: { kind: 'conflict', providers: current.map(ref) },
    }
  if (current.length === 1) {
    const [only] = current
    return {
      extension,
      approvalNeeded,
      source: {
        kind: 'provider',
        ...ref(only),
        identity: {
          pluginId: only.pluginId,
          extractorId: only.extractorVersion.id,
          engineVersion: only.extractorVersion.engineVersion,
          chunkerVersion: only.extractorVersion.chunkerVersion,
        },
      },
    }
  }
  const api = kordocIndexApi(app)
  if (!api) return { extension, approvalNeeded, source: { kind: 'none' } }
  const version = api.indexTextExtractor
  return {
    extension,
    approvalNeeded,
    source: {
      kind: 'legacy',
      ...(version
        ? {
            identity: {
              pluginId: KORDOC_PROVIDER_ID,
              extractorId: 'kordoc',
              ...version,
            },
          }
        : {}),
    },
  }
}

export function sourceIdentity(source: ExtractionSource) {
  return source.kind === 'provider' || source.kind === 'legacy'
    ? source.identity
    : undefined
}

/** The plugin a new projection from this source is attributed to. */
export function sourcePluginId(source: ExtractionSource): string | undefined {
  if (source.kind === 'provider') return source.pluginId
  return source.kind === 'legacy' ? KORDOC_PROVIDER_ID : undefined
}

export async function extractWithSource(
  app: App,
  source: ExtractionSource,
  path: string,
  signal: AbortSignal,
  ocr: 'off' | 'candidates',
): Promise<IndexTextResult> {
  if (source.kind === 'legacy') return extractIndexText(app, path, signal, ocr)
  const host = source.kind === 'provider' ? hosts.get(app) : undefined
  if (!host || source.kind !== 'provider')
    return {
      status: 'extractor_unavailable',
      message: 'No text extraction source is available',
    }
  return host.extract(source.pluginId, { path, signal, ocr })
}
