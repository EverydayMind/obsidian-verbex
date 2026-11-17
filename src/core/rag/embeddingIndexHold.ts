import type { EmbeddingErrorKind } from '../../database/modules/vector/VectorManager'
import { VerbexSettings } from '../../settings/schema/setting.types'
import { dataEqual } from '../../utils/dataEqual'

export function embeddingSettingsChanged(
  a: VerbexSettings,
  b: VerbexSettings,
): boolean {
  return (
    !dataEqual(a.providers, b.providers) ||
    a.embeddingModelId !== b.embeddingModelId ||
    !dataEqual(a.embeddingModels, b.embeddingModels) ||
    a.verbex.search.mode !== b.verbex.search.mode
  )
}

export function shouldHoldEmbeddingIndex(kind: EmbeddingErrorKind): boolean {
  return (
    kind === 'runtime_missing' ||
    kind === 'configuration' ||
    kind === 'authentication'
  )
}

export function initialSearchSettings(
  settings: VerbexSettings,
  raw: unknown,
  installed: boolean,
): VerbexSettings {
  if (raw != null || installed) return settings
  return {
    ...settings,
    verbex: {
      ...settings.verbex,
      search: { ...settings.verbex.search, mode: 'bm25' },
    },
  }
}
