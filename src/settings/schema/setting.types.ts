import { z } from 'zod'

import {
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_PROMPTS_FOLDER,
  DEFAULT_PROVIDERS,
  DEFAULT_SKILLS_FOLDER,
  DEFAULT_WORKFLOWS_FOLDER,
  LOCAL_E5_FP16_MODEL_ID,
} from '../../constants'
import { t } from '../../i18n'
import { connectorSettingsSchema } from '../../provider/connectors/manifestSchema'
import { nativeProviderSettingsSchema } from '../../provider/interop/protocol'
import { chatModelSchema } from '../../types/chat-model.types'
import { embeddingModelSchema } from '../../types/embedding-model.types'
import { mcpServerConfigSchema } from '../../types/mcp.types'
import { llmProviderSchema } from '../../types/provider.types'

import { SETTINGS_SCHEMA_VERSION } from './migrations'

const ragOptionsSchema = z.object({
  chunkSize: z.number().catch(1000),
  thresholdTokens: z.number().catch(8192),
  minSimilarity: z.number().catch(0.0),
  limit: z.number().catch(10),
  // Fuse one-hop wikilink/backlink graph candidates into ContextBuilder's
  // semantic retrieval. Graph expansion is part of the default search mode;
  // an explicit false remains available for users who want to disable it.
  expandGraph: z.boolean().catch(true),
  // Weight of BM25 (lexical) scores when fusing with embedding similarity
  // in hybrid search. 0 = embedding only, 1 = BM25 only.
  bm25Weight: z.number().catch(0.3),
  // Follow markdown links found in retrieved vault results and include the
  // linked markdown files as extra context.
  linkedMarkdownFileLimit: z.number().catch(10),
  linkedMarkdownDepth: z.number().catch(1),
  excludePatterns: z.array(z.string()).catch([]),
  includePatterns: z.array(z.string()).catch([]),
})

const verbexSearchSchema = z.object({
  mode: z.enum(['bm25', 'embedding', 'hybrid']).catch('hybrid'),
  topK: z.number().min(1).max(50).catch(10),
  candidateMultiplier: z.number().min(1).max(10).catch(3),
  chunkStrategy: z
    .enum(['markdown_structure', 'token_window'])
    .catch('markdown_structure'),
  linkExpansionDepth: z.number().min(0).max(3).catch(1),
  // Relevance floor for semantic (embedding/hybrid) hits, relative to the best
  // hit of the same query (model-agnostic: avoids assuming an absolute
  // similarity scale). A hit is dropped when its similarity is below
  // bestSimilarity * floor, so the weak tail of a semantic search — distractors
  // far less relevant than the top match — never enters the context. The single
  // best hit is always kept. Set to 0 to disable the floor.
  semanticRelativeFloor: z.number().min(0).max(1).catch(0.6),
  // Relevance floor for lexical (BM25 keyword) hits, relative to the best hit of
  // the same query. Mirrors `semanticRelativeFloor` so the keyword-search source
  // also drops its weak tail — a low-scoring BM25 match that happens to fit the
  // token budget is a distractor, not signal, and should not enter the context
  // just because there was room. The single best hit is always kept. Set to 0 to
  // disable the floor. Kept slightly looser than the semantic floor because BM25
  // scores spread differently (unbounded, length-normalized).
  lexicalRelativeFloor: z.number().min(0).max(1).catch(0.5),
  // When true, notes related only structurally (backlinks, shared-tag notes)
  // are gated by query relevance: in embedding/hybrid mode a backlink is kept
  // only if it also surfaced in semantic search, so a note that merely links to
  // the current note without bearing on the query is treated as noise and
  // dropped. Turn off to always include structural relatives.
  gateStructuralRelations: z.boolean().catch(true),
  chunkSize: z.number().min(100).max(2000).catch(512),
  chunkOverlap: z.number().min(0).catch(64),
  excludePaths: z.array(z.string()).catch(['.verbex/']),
  // Notes whose frontmatter `type` is listed here stay out of every index.
  // The default keeps machine-written style profiles (one very long JSON
  // line each) from filling search with noise.
  excludeTypes: z.array(z.string()).catch(['report-style-profile']),
  documents: z
    .object({
      enabled: z.boolean().catch(false),
      formats: z
        .object({
          hwp: z.boolean().catch(true),
          hwpx: z.boolean().catch(true),
          pdf: z.boolean().catch(true),
        })
        .catch({ hwp: true, hwpx: true, pdf: true }),
      ocr: z.enum(['off', 'manual']).catch('off'),
      autoMaxPages: z.number().int().positive().catch(500),
      includePaths: z.array(z.string()).catch([]),
      excludePaths: z.array(z.string()).catch([]),
      embed: z.boolean().catch(false),
      embedConsentModelId: z.string().optional(),
      autoMaxBytes: z
        .number()
        .positive()
        .catch(30 * 1024 * 1024),
    })
    .catch({
      enabled: false,
      formats: { hwp: true, hwpx: true, pdf: true },
      ocr: 'off',
      autoMaxPages: 500,
      includePaths: [],
      excludePaths: [],
      embed: false,
      autoMaxBytes: 30 * 1024 * 1024,
    }),
  includeAttachments: z.boolean().catch(false),
  reranker: z
    .object({
      enabled: z.boolean().catch(false),
      provider: z.string().optional(),
      model: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .catch({
      enabled: false,
    }),
})

const verbexPermissionsSchema = z.object({
  defaultPermission: z
    .enum([
      'read_only',
      'diff_only',
      'approve_write',
      'auto',
      'session_trust',
      'forbidden',
    ])
    .catch('diff_only'),
  alwaysRequireApproval: z.boolean().catch(true),
  autoModeDefault: z.boolean().catch(false),
  autoModeTimeoutSeconds: z.number().min(3).max(60).catch(5),
  autoModeExclude: z
    .array(z.string())
    .catch(['delete', 'move', 'external_api']),
  checkpointBeforeWrite: z.boolean().catch(true),
  maxFilesPerDiff: z.number().min(1).catch(20),
  allowWebSearch: z.boolean().catch(false),
  allowExternalApi: z.boolean().catch(true),
})

const verbexContextSchema = z.object({
  contextBudgetMode: z.enum(['auto', 'custom']).catch('auto'),
  // First-turn retrieval policy. `autoContext` remains below as a legacy
  // compatibility field and is synchronized by the settings UI/migration.
  firstTurnMode: z.enum(['auto', 'full', 'catalog', 'off']).catch('auto'),
  // Bodyless catalog references have an independent cap so they cannot spend
  // the full body-context budget merely listing candidates.
  catalogTokenBudget: z.number().min(128).max(20000).catch(1200),
  catalogCandidateLimit: z.number().int().min(1).max(100).catch(12),
  maxContextTokens: z.number().min(1000).max(200000).catch(32000),
  wikiTokenBudget: z.number().catch(4000),
  searchResultTokenBudget: z.number().catch(8000),
  // Default matches the previous hard-coded cap (5000) so skills in the
  // 4000–5000 token range are not silently truncated after F-1 wiring.
  skillTokenBudget: z.number().catch(5000),
  currentNoteMode: z.enum(['snippet', 'auto', 'fullWhenFits']).catch('auto'),
  currentNoteTokenBudget: z.number().min(500).max(100000).catch(4000),
  attachmentDigestTokenThresholdRatio: z.number().min(0.05).max(1).catch(0.7),
  autoCompact: z.boolean().catch(true),
  // When true, once the transcript grows past EVICTION_TRIGGER_RATIO of the
  // budget, the model is asked which previously-read files are no longer
  // relevant to the goal and their bodies are dropped (relevance-based, not
  // age-based). See context/relevanceEviction.ts.
  relevanceEviction: z.boolean().catch(true),
  // When true, an attached file larger than the model's input budget is split
  // and processed with a map-reduce pass (요구사항 2·3) instead of failing with a
  // "context window exceeded" error. See core/llm/documentMapReduce.ts.
  autoSplitLargeInput: z.boolean().catch(true),
  // M5b production switch. Kept off until the §6.6 quality gate is measured.
  batchAnalysisEngine: z.boolean().catch(false),
  // M5c production switch; independent rollback for whole-file transforms.
  batchTransformEngine: z.boolean().catch(false),
  // M9 quota-box: 0 disables the respective boundary.
  batchMaxCompletionCallsPerTurn: z.number().int().min(0).max(1000).catch(20),
  batchMaxWallTimeMsPerTurn: z.number().int().min(0).max(3600000).catch(120000),
  // Tokens held back from the model's context window for its own output plus
  // request framing overhead, when computing the usable input budget.
  reservedOutputTokens: z.number().min(256).max(64000).catch(8000),
  // Fraction of the usable input budget each map-reduce chunk is allowed to
  // fill (0.05–1). The default 1 fills the whole window per call; lowering it
  // (e.g. 0.5 = half) shrinks each chunk so a single map/reduce LLM call does
  // less work and is far less likely to hit the request timeout — at the cost
  // of more chunks (more total calls). See core/llm/documentMapReduce.ts.
  mapReduceChunkRatio: z.number().min(0.05).max(1).catch(1),
  // Per-call request timeout (ms) for map-reduce map/reduce steps. These are
  // long analytical calls over large chunks, so they get their own timeout
  // separate from the interactive-chat default (httpTransport's 120s). Raise it
  // when chunks are large; lower it to fail fast.
  mapReduceTimeoutMs: z.number().int().min(10000).max(600000).catch(120000),
  // Max output tokens for each map/reduce/verify/final step. Bounds every
  // partial so an intermediate output cannot itself become an oversized input
  // on the next round, but must be large enough that summaries/merges are not
  // cut off mid-answer (finish_reason: length). The effective budget is the
  // smaller of this and a fraction of the input budget. Raise it when partials
  // are being truncated; lower it to cap intermediate size. See
  // core/llm/contextWindow.ts (computeMapReduceOutputBudget).
  mapReduceMaxOutputTokens: z.number().int().min(512).max(32000).catch(4096),
  // §6.6 cost gate: when a whole-document analysis or transform is predicted to
  // split into more than this many chunks (≈ LLM calls), ask the user to confirm
  // before running the expensive job. 0 disables the prompt (fully automatic).
  // The default keeps ordinary large files friction-free and only gates the
  // genuinely huge ones.
  largeFileConfirmChunkThreshold: z.number().int().min(0).max(1000).catch(20),
  // When true, the agent's first turn is grounded with auto-built vault context
  // (curated wiki / search / linked notes). Follow-up turns rely on read
  // tools instead, so the bulk context is not re-injected every turn. Turn it
  // off to make the agent fully tool-driven from the first turn.
  autoContext: z.boolean().catch(true),
})

const verbexDebugSchema = z.object({
  routing: z.boolean().catch(false),
  mode: z.boolean().catch(false),
  storeRunBodies: z.boolean().catch(false),
})

const verbexPrivacySchema = z.object({
  // Audit data is opt-in. When enabled, the chat surface records aggregate
  // turn facts only; raw prompts and tool payloads are never persisted.
  auditLogging: z.boolean().catch(false),
})

const relatedNotesSchema = z.object({
  excludeDailyNotes: z.boolean().catch(true),
  autoRefresh: z.boolean().catch(true),
  limit: z.number().int().min(1).max(50).catch(8),
})

const embeddingIndexStateSchema = z.discriminatedUnion('phase', [
  z.object({
    phase: z.literal('ready'),
    activeModelId: z.string().min(1),
    targetModelId: z.string().min(1),
  }),
  z.object({
    // A model selection changed, but its index has not been explicitly
    // rebuilt yet. The active model remains usable while targetModelId is
    // waiting for the user's rebuild command.
    phase: z.literal('pending'),
    activeModelId: z.string().min(1),
    targetModelId: z.string().min(1),
  }),
  z.object({
    phase: z.literal('rebuilding'),
    activeModelId: z.string().min(1),
    targetModelId: z.string().min(1),
    startedAt: z.number(),
    previousModelId: z.string().min(1).optional(),
  }),
  z.object({
    phase: z.literal('failed'),
    activeModelId: z.string().min(1),
    targetModelId: z.string().min(1),
    startedAt: z.number(),
    error: z.string(),
    previousModelId: z.string().min(1).optional(),
  }),
])

export type EmbeddingIndexState = z.infer<typeof embeddingIndexStateSchema>

/**
 * Settings
 */

export const verbexSettingsSchema = z.object({
  // Version
  documentJobs: z
    .object({ baseFontPt: z.number().min(6).max(40).multipleOf(0.5).catch(15) })
    .catch({ baseFontPt: 15 }),
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  // Parent directory of the last successful session export, local UI preference.
  lastSessionExportFolder: z.string().catch(''),

  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  // §8-1: no chat models are pre-registered. A parse failure (missing/
  // malformed field) yields an empty list, not a hardcoded catalog — first
  // run/first registration flows (see modelReadiness.ts) are what populate
  // this, not the schema default.
  chatModels: z.array(chatModelSchema).catch([]),

  embeddingModels: z
    .array(embeddingModelSchema)
    .catch([...DEFAULT_EMBEDDING_MODELS]),

  // '' = unset. See chatModels above: no default model id is assumed to
  // exist.
  chatModelId: z.string().catch(''), // model for default chat feature
  applyModelId: z.string().catch(''), // model for apply feature
  embeddingModelId: z.string().catch(LOCAL_E5_FP16_MODEL_ID), // model for embedding
  localEmbeddingDevice: z.enum(['cpu', 'webgpu']).catch('cpu'),
  // Runtime/index lifecycle state. `embeddingModelId` remains the user's
  // selected target; this state records whether the target's index is ready.
  embeddingIndexState: embeddingIndexStateSchema.nullable().catch(null),

  // Named model aliases for step routing (PRD §17). Each maps to a chat model
  // id; empty/unset aliases fall back to chatModelId at resolve time.
  modelAliases: z
    .object({
      default: z.string().optional(),
      fast: z.string().optional(),
      high_reasoning: z.string().optional(),
    })
    .catch({}),

  // System Prompt
  systemPrompt: z.string().catch(''),
  systemPromptConfig: z
    .object({
      customInstructions: z.string().catch(''),
      folderInstructionsEnabled: z.boolean().catch(true),
      // Inject a compact vault map (folders, tags, hub notes) into the system
      // prompt so the agent starts oriented without spending tool calls.
      vaultOrientationEnabled: z.boolean().catch(true),
    })
    .catch({
      customInstructions: '',
      folderInstructionsEnabled: true,
      vaultOrientationEnabled: true,
    }),

  // Agent context files
  // Path to AGENTS.md file (vault-relative). Content is injected into every
  // chat as top-level agent instructions, similar to CLAUDE.md in Claude Code.
  agentsMdPath: z.string().catch('.verbex/system-prompt.md'),
  // Folder containing skill files (vault-relative). Each .md file in this
  // folder is loaded as a named skill and injected alongside AGENTS.md.
  // Agent configuration defaults to the hidden .verbex directory.
  skillsFolder: z.string().catch(DEFAULT_SKILLS_FOLDER),
  workflowsFolder: z.string().catch(DEFAULT_WORKFLOWS_FOLDER),
  promptsFolder: z.string().catch(DEFAULT_PROMPTS_FOLDER),
  // Optional folder whose notes summarize the vault. Its files are shown at
  // the top of vault inventories so the agent considers the curated wiki first.
  vaultWikiFolder: z.string().catch('wiki'),
  runsFolder: z.string().catch('.verbex/Runs'),

  verbex: z
    .object({
      search: verbexSearchSchema.catch(verbexSearchSchema.parse({})),
      permissions: verbexPermissionsSchema.catch(
        verbexPermissionsSchema.parse({}),
      ),
      context: verbexContextSchema.catch(verbexContextSchema.parse({})),
      debug: verbexDebugSchema.catch({
        routing: false,
        mode: false,
        storeRunBodies: false,
      }),
      privacy: verbexPrivacySchema.catch({ auditLogging: false }),
      relatedNotes: relatedNotesSchema.catch(relatedNotesSchema.parse({})),
    })
    .catch({
      search: verbexSearchSchema.parse({}),
      permissions: verbexPermissionsSchema.parse({}),
      context: verbexContextSchema.parse({}),
      debug: { routing: false, mode: false, storeRunBodies: false },
      privacy: { auditLogging: false },
      relatedNotes: relatedNotesSchema.parse({}),
    }),

  // RAG Options
  ragOptions: ragOptionsSchema.catch({
    chunkSize: 1000,
    thresholdTokens: 8192,
    minSimilarity: 0.0,
    limit: 10,
    expandGraph: true,
    bm25Weight: 0.3,
    linkedMarkdownFileLimit: 10,
    linkedMarkdownDepth: 1,
    excludePatterns: [],
    includePatterns: [],
  }),

  pluginConnectors: connectorSettingsSchema,
  nativeProviders: nativeProviderSettingsSchema,

  // MCP configuration
  mcp: z
    .object({
      servers: z.array(mcpServerConfigSchema).catch([]),
    })
    .catch({
      servers: [],
    }),

  // Chat options
  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      enableTools: z.boolean(),
      maxAutoIterations: z.number(),
      // Minimum source-note reads required before an evidence-synthesis task
      // may finish. Zero disables the evidence completion guard.
      minEvidenceReads: z.number().int().min(0).max(20).default(3),
      // Message sent by the "NEXT" button to advance the agent without the
      // user typing "진행하세요" / "go ahead" each time.
      nextButtonMessage: z.string().default(() => t('runtimeR5.nextMessage')),
    })
    .catch(() => ({
      includeCurrentFileContent: true,
      enableTools: true,
      maxAutoIterations: 16,
      minEvidenceReads: 3,
      nextButtonMessage: t('runtimeR5.nextMessage'),
    })),
})
export type VerbexSettings = z.infer<typeof verbexSettingsSchema>

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}
