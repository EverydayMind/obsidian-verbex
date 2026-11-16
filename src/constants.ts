import { EmbeddingModel } from './types/embedding-model.types'
import { LLMProvider, LLMProviderType } from './types/provider.types'

export const CHAT_VIEW_TYPE = 'verbex-chat-view'
export const APPLY_VIEW_TYPE = 'verbex-apply-view'
export const STATUS_VIEW_TYPE = 'verbex-status-view'
export const RELATED_VIEW_TYPE = 'verbex-related-notes-view'

// Internal, hidden agent directory: runs, index, checkpoints, backups,
// system-prompt.md. Obsidian hides dot-folders, so users do not edit these.
export const VERBEX_DIR = '.verbex'
// Configuration is stored in the hidden agent directory.
export const DEFAULT_SKILLS_FOLDER = `${VERBEX_DIR}/Skills`
export const DEFAULT_WORKFLOWS_FOLDER = `${VERBEX_DIR}/Workflows`
export const DEFAULT_PROMPTS_FOLDER = `${VERBEX_DIR}/Prompts`
export const DEFAULT_EXPORT_FOLDER = 'Outputs/Exports'
export const DEFAULT_PROFILE_FOLDER = 'Outputs/Profiles'
export const DEFAULT_TOOL_REQUEST_LOG = 'Outputs/Tool Requests.md'
export const RETRIEVAL_EVALUATION_DIR = `${VERBEX_DIR}/Evaluation`
export const PGLITE_DB_PATH = `${VERBEX_DIR}/index/vector.pglite.tar.gz`

// Default model ids
export const DEFAULT_CHAT_MODEL_ID = ''
export const DEFAULT_APPLY_MODEL_ID = ''

export const LOCAL_E5_FP16_MODEL_ID = 'local/multilingual-e5-small-fp16'

// Recommended model ids
export const RECOMMENDED_MODELS_FOR_CHAT: string[] = []
export const RECOMMENDED_MODELS_FOR_APPLY: string[] = []
export const RECOMMENDED_MODELS_FOR_EMBEDDING = [LOCAL_E5_FP16_MODEL_ID]

export const PLAN_PROVIDER_TYPES: readonly LLMProviderType[] = [] as const

// Default OpenAI-compatible API base URLs per provider type. Empty string
// means the user must supply a base URL (no public default).
export const PROVIDER_DEFAULT_BASE_URLS: Record<LLMProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  claude: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  'openai-compatible': '',
}

export const PROVIDER_TYPES_INFO = {
  openai: {
    label: 'OpenAI',
    defaultProviderId: 'openai',
    requireApiKey: true,
    requireBaseUrl: false,
    supportEmbedding: true,
    supportTools: true,
    additionalSettings: [],
  },
  openrouter: {
    label: 'OpenRouter',
    defaultProviderId: null,
    requireApiKey: true,
    requireBaseUrl: false,
    supportEmbedding: false,
    supportTools: true,
    additionalSettings: [],
  },
  claude: {
    label: 'Anthropic (Claude)',
    defaultProviderId: null,
    requireApiKey: true,
    requireBaseUrl: false,
    supportEmbedding: false,
    supportTools: true,
    additionalSettings: [],
  },
  gemini: {
    label: 'Google Gemini',
    defaultProviderId: null,
    requireApiKey: true,
    requireBaseUrl: false,
    supportEmbedding: true,
    supportTools: true,
    additionalSettings: [],
  },
  ollama: {
    label: 'Ollama',
    defaultProviderId: null,
    requireApiKey: false,
    requireBaseUrl: false,
    supportEmbedding: true,
    supportTools: false,
    additionalSettings: [],
  },
  lmstudio: {
    label: 'LM Studio',
    defaultProviderId: null,
    requireApiKey: false,
    requireBaseUrl: false,
    supportEmbedding: true,
    supportTools: false,
    additionalSettings: [],
  },
  'openai-compatible': {
    label: 'OpenAI Compatible',
    defaultProviderId: null,
    requireApiKey: false,
    requireBaseUrl: true,
    supportEmbedding: true,
    supportTools: false,
    additionalSettings: [],
  },
} as const satisfies Record<
  LLMProviderType,
  {
    label: string
    defaultProviderId: string | null
    requireApiKey: boolean
    requireBaseUrl: boolean
    supportEmbedding: boolean
    supportTools: boolean
    additionalSettings: {
      label: string
      key: string
      type: 'text' | 'toggle'
      placeholder?: string
      description?: string
      required?: boolean
    }[]
  }
>

/**
 * Important
 * 1. When adding new default provider, settings migration should be added
 * 2. If there's same provider id in user's settings, it's data should be overwritten by default provider
 */
export const DEFAULT_PROVIDERS: readonly LLMProvider[] = [
  {
    type: 'openai',
    id: PROVIDER_TYPES_INFO.openai.defaultProviderId,
  },
]

/**
 * Important
 * 1. When adding new default embedding model, settings migration should be added
 * 2. If there's same embedding model id in user's settings, it's data should be overwritten by default embedding model
 */

export const DEFAULT_EMBEDDING_MODELS: readonly EmbeddingModel[] = [
  {
    providerType: 'local',
    providerId: 'local',
    id: LOCAL_E5_FP16_MODEL_ID,
    model: 'multilingual-e5-small-fp16',
    dimension: 384,
  },
]
