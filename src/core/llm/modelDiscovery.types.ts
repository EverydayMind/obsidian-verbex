/**
 * Shared types for provider model discovery ("Fetch Models"). Kept separate
 * from `modelDiscovery.ts` so `base.ts` (and every provider) can depend on
 * the typed contract without importing `modelDiscovery.ts`, which pulls in
 * `manager.ts` (which imports every provider, including `base.ts`) and would
 * create an import cycle.
 */

export type ModelDiscoveryStatus =
  | 'remote'
  | 'curated'
  | 'unsupported'
  | 'error'

export type ModelDiscoveryErrorCategory =
  | 'auth'
  | 'endpoint'
  | 'server'
  | 'network'
  | 'empty'
  | 'malformed'

export type ModelDiscoveryEntry = {
  // Settings identity. Usually equal to model, but not necessarily (curated
  // catalogs keep the existing settings id distinct from the wire model, e.g.
  // id: 'example-model', model: 'openai/example-model').
  id: string
  // Wire value sent to the provider API.
  model: string
  // Provider metadata is optional. Unknown must remain distinct from false.
  capabilities?: { chat?: boolean; embedding?: boolean }
  // Known context-window metadata from providers such as OpenRouter. It is
  // intentionally optional: most OpenAI-compatible endpoints do not report
  // it, and an unknown value must not be presented as a measured limit.
  contextWindow?: number
}

export type ModelDiscoveryResult = {
  status: ModelDiscoveryStatus
  models: ModelDiscoveryEntry[]
  // curated fallback may also carry the probe issue; it must not look like a
  // successful remote result just because usable local choices are displayed.
  errorCategory?: ModelDiscoveryErrorCategory
  safeErrorMessage?: string
  truncated?: boolean
  droppedEntryCount?: number
}

// Provider adapter's raw entry shape before discovery-layer normalization. An
// `id` that is a number, or an entry that is `null`, is malformed input the
// discovery layer must classify rather than silently drop like a plain
// `ModelDiscoveryEntry[]` would.
export type ProviderModelListEntry =
  | string
  | {
      id?: unknown
      model?: unknown
      capabilities?: unknown
      [key: string]: unknown
    }

// Returned by `BaseLLMProvider.listModels()`. Providers report the raw entry
// list plus whether it came from a live probe or a curated fallback catalog;
// normalization into `ModelDiscoveryEntry[]` happens at the discovery
// boundary (`discoverProviderModels`), not inside each provider.
export type ProviderModelListResult = {
  source: 'remote' | 'curated'
  models: ProviderModelListEntry[]
  // Set when `source: 'curated'` is a fallback for a failed probe (or a
  // provider probe returned a partial/degraded remote result) so the UI can
  // show why the list isn't a fresh remote answer.
  issueCategory?: ModelDiscoveryErrorCategory
  truncated?: boolean
}

export type NormalizedModelEntries = {
  entries: ModelDiscoveryEntry[]
  // Well-typed entries dropped for being empty after trim, or duplicates.
  droppedEntryCount: number
  // Entries whose shape could not be interpreted as an id/model pair at all.
  malformedEntryCount: number
}
