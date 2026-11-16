import {
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROMPTS_FOLDER,
  DEFAULT_SKILLS_FOLDER,
  DEFAULT_WORKFLOWS_FOLDER,
  LOCAL_E5_FP16_MODEL_ID,
} from '../../../constants'
import { SettingMigration } from '../setting.types'

import { migrateMcpTransport } from './migrateMcpTransport'
import { migrateMocToWiki } from './migrateMocToWiki'
import { migrateResponsesApiMode } from './migrateResponsesApiMode'
import { migrateUserDirFolders } from './migrateUserDirFolders'
import { removeRetiredProviders } from './removeRetiredProviders'
import { resetLegacyModels } from './resetLegacyModels'

export const SETTINGS_SCHEMA_VERSION = 36
const LEGACY_DEFAULT_MAX_CONTEXT_TOKENS = 32_000

/** Settings before v17 reset provider and model settings to neutral defaults. */
export const SETTING_MIGRATIONS: SettingMigration[] = [
  {
    fromVersion: 0,
    toVersion: 17,
    migrate: resetLegacyModels,
  },
  {
    fromVersion: 17,
    toVersion: 18,
    migrate: migrateUserDirFolders,
  },
  {
    fromVersion: 18,
    toVersion: 19,
    migrate: migrateMocToWiki,
  },
  {
    fromVersion: 19,
    toVersion: 20,
    migrate: (data) => {
      const verbex = data.verbex as Record<string, unknown> | undefined
      const context = verbex?.context as Record<string, unknown> | undefined
      if (!context || context.contextBudgetMode !== undefined) return data
      return {
        ...data,
        verbex: {
          ...verbex,
          context: {
            ...context,
            contextBudgetMode:
              context.maxContextTokens === undefined ||
              context.maxContextTokens === LEGACY_DEFAULT_MAX_CONTEXT_TOKENS
                ? 'auto'
                : 'custom',
          },
        },
      }
    },
  },
  {
    fromVersion: 20,
    toVersion: 21,
    migrate: (data) => {
      const verbex = data.verbex as Record<string, unknown> | undefined
      const search = verbex?.search as Record<string, unknown> | undefined
      if (
        !search ||
        !Object.prototype.hasOwnProperty.call(search, 'koreanNgramEnabled')
      ) {
        return data
      }
      const nextSearch = { ...search }
      delete nextSearch.koreanNgramEnabled
      return {
        ...data,
        verbex: {
          ...verbex,
          search: nextSearch,
        },
      }
    },
  },
  {
    fromVersion: 21,
    toVersion: 22,
    migrate: (data) => {
      const verbex = data.verbex as Record<string, unknown> | undefined
      const context = verbex?.context as Record<string, unknown> | undefined
      if (context?.firstTurnMode !== undefined) return data
      const firstTurnMode = context?.autoContext === false ? 'off' : 'full'
      return {
        ...data,
        verbex: {
          ...verbex,
          context: {
            ...context,
            firstTurnMode,
          },
        },
      }
    },
  },
  {
    fromVersion: 22,
    toVersion: 23,
    migrate: (data) => ({ ...data, pluginConnectors: { connectors: [] } }),
  },
  { fromVersion: 23, toVersion: 24, migrate: migrateMcpTransport },
  // OAuth adds a secret-reference auth variant; existing connections need no rewrite.
  { fromVersion: 24, toVersion: 25, migrate: (data) => data },
  { fromVersion: 25, toVersion: 26, migrate: migrateResponsesApiMode },
  // Self-exposed plugin providers start unapproved; connector approvals do not carry over.
  {
    fromVersion: 26,
    toVersion: 27,
    migrate: (data) => ({ ...data, nativeProviders: { providers: [] } }),
  },
  // Schema defaults add local-only, opt-in document indexing to existing installations.
  { fromVersion: 27, toVersion: 28, migrate: (data) => data },
  { fromVersion: 28, toVersion: 29, migrate: (data) => data },
  { fromVersion: 29, toVersion: 30, migrate: (data) => data },
  {
    fromVersion: 30,
    toVersion: 31,
    migrate: (data) => {
      const model = DEFAULT_EMBEDDING_MODELS.find(
        (item) => item.id === LOCAL_E5_FP16_MODEL_ID,
      )
      if (!model) throw new Error('FP16 embedding model definition is missing')
      const models = Array.isArray(data.embeddingModels)
        ? (data.embeddingModels as unknown[])
        : DEFAULT_EMBEDDING_MODELS
      return {
        ...data,
        embeddingModels: [
          ...models.filter(
            (item) =>
              (item as { id?: string } | null)?.id !== LOCAL_E5_FP16_MODEL_ID,
          ),
          model,
        ],
      }
    },
  },
  {
    fromVersion: 31,
    toVersion: 32,
    migrate: (data) => {
      const retired = 'local/multilingual-e5-small-int8'
      const models = Array.isArray(data.embeddingModels)
        ? data.embeddingModels
        : DEFAULT_EMBEDDING_MODELS
      const selected =
        data.embeddingModelId === retired
          ? LOCAL_E5_FP16_MODEL_ID
          : data.embeddingModelId
      const state = data.embeddingIndexState as
        | { phase?: string; activeModelId?: string; targetModelId?: string }
        | null
        | undefined
      let nextState = state
      if (state?.activeModelId === retired) {
        const target =
          typeof selected === 'string' && selected
            ? selected
            : LOCAL_E5_FP16_MODEL_ID
        nextState = {
          phase: 'pending',
          activeModelId: target,
          targetModelId: target,
        }
      } else if (
        state?.targetModelId === retired ||
        data.embeddingModelId === retired
      ) {
        const target =
          typeof selected === 'string' && selected
            ? selected
            : LOCAL_E5_FP16_MODEL_ID
        const active = state?.activeModelId
        nextState =
          active === target
            ? { phase: 'ready', activeModelId: active, targetModelId: target }
            : {
                phase: 'pending',
                activeModelId: active || target,
                targetModelId: target,
              }
      }

      return {
        ...data,
        embeddingModels: models.filter(
          (item) => (item as { id?: string } | null)?.id !== retired,
        ),
        embeddingModelId: selected,
        embeddingIndexState: nextState,
      }
    },
  },
  { fromVersion: 32, toVersion: 33, migrate: (data) => data },
  {
    fromVersion: 33,
    toVersion: 34,
    migrate: (data) => {
      const next = { ...data }
      for (const [key, oldPath, newPath] of [
        ['skillsFolder', 'Verbex/Skills', DEFAULT_SKILLS_FOLDER],
        ['workflowsFolder', 'Verbex/Workflows', DEFAULT_WORKFLOWS_FOLDER],
        ['promptsFolder', 'Verbex/Prompts', DEFAULT_PROMPTS_FOLDER],
      ]) {
        const value = next[key]
        if (
          typeof value === 'string' &&
          value.trim().replace(/\/+$/, '') === oldPath
        )
          next[key] = newPath
      }
      return next
    },
  },
  {
    fromVersion: 34,
    toVersion: 35,
    migrate: (data) => {
      const options = data.chatOptions as Record<string, unknown> | undefined
      if (options?.maxAutoIterations !== 8) return data
      return { ...data, chatOptions: { ...options, maxAutoIterations: 16 } }
    },
  },
  { fromVersion: 35, toVersion: 36, migrate: removeRetiredProviders },
]
