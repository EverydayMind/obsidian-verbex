import { SETTINGS_SCHEMA_VERSION, SETTING_MIGRATIONS } from './migrations'
import { VerbexSettings, verbexSettingsSchema } from './setting.types'

function migrateSettings(
  data: Record<string, unknown>,
): Record<string, unknown> {
  let currentData = { ...data }
  let currentVersion = (currentData.version as number) ?? 0

  for (const migration of SETTING_MIGRATIONS) {
    if (
      currentVersion >= migration.fromVersion &&
      currentVersion < migration.toVersion &&
      migration.toVersion <= SETTINGS_SCHEMA_VERSION
    ) {
      console.debug(
        `Migrating settings from ${migration.fromVersion} to ${migration.toVersion}`,
      )
      currentData = migration.migrate(currentData)
      currentVersion = migration.toVersion
    }
  }

  return currentData
}

export function parseVerbexSettings(data: unknown): VerbexSettings {
  try {
    const migratedData = migrateSettings(data as Record<string, unknown>)
    const settings = verbexSettingsSchema.parse(migratedData)
    const state = settings.embeddingIndexState
    // Versions before the explicit-rebuild flow persisted the target model as
    // active while rebuilding. Recover those sessions to the previous active
    // model instead of resuming a rebuild during startup.
    if (
      state &&
      state.phase !== 'pending' &&
      state.phase !== 'ready' &&
      state.previousModelId
    ) {
      return {
        ...settings,
        embeddingIndexState: {
          phase: state.phase === 'rebuilding' ? 'pending' : 'failed',
          activeModelId: state.previousModelId,
          targetModelId: state.targetModelId,
          ...(state.phase === 'failed'
            ? { startedAt: state.startedAt, error: state.error }
            : {}),
        } as VerbexSettings['embeddingIndexState'],
      }
    }
    return settings
  } catch (error) {
    console.warn('Invalid settings provided, using defaults:', error)
    return verbexSettingsSchema.parse({})
  }
}

/** Missing data uses schema defaults; stored data runs the migration chain. */
export function resolveLoadedSettings(raw: unknown): VerbexSettings {
  if (raw == null) {
    return verbexSettingsSchema.parse({ version: SETTINGS_SCHEMA_VERSION })
  }
  return parseVerbexSettings(raw)
}
