import type { RequestTool } from '../types/llm/request'

export const VERBEX_PROVIDER_HOST_PROTOCOL_VERSION = 1 as const
/** Public UI bridge used by companion plugins to submit a normal chat turn. */
export const VERBEX_CHAT_HOST_PROTOCOL_VERSION = 1 as const
export const KORDOC_PROVIDER_PROTOCOL_VERSION = 1 as const
export const KORDOC_PROVIDER_ID = 'kordoc-transform' as const
/** HWPX Exporter plugin id (was `hwpx-exporter` before 0.9.5). */
export const HWPX_EXPORTER_PROVIDER_ID = 'md-to-hwpx' as const
export const KORDOC_PROVIDER_SCHEMA_VERSION = '1.0.0' as const
export const KORDOC_PROVIDER_SCHEMA_HASH =
  'sha256:5dbe8a45000507f2872cb7869425ed72e957b812f9949474b66bc0e7f7181ebd' as const

export const KORDOC_PROVIDER_TOOL_NAMES = [
  'kordoc__inspect_document',
  'kordoc__inspect_blocks',
  'kordoc__prepare_block_patch',
] as const

export type HwpEditScope = {
  /** Host-selected document context. A single-block scope is an edit lock. */
  scope: 'document' | 'single-block'
  operation: 'transform'
  /** One-shot correlation id issued by the companion host for this turn. */
  contextId: string
  path: string
  sourceHash: string
  blockIndex?: number
  blockType?: 'paragraph' | 'heading' | 'table'
  tableShape?: { rows: number; cols: number }
  targetCell?: { row: number; col: number }
  tableCells?: { row: number; col: number; text: string }[]
  tableCellsTruncated?: boolean
}

export type ChatSubmissionResult =
  | { status: 'submitted'; messageId: string }
  | { status: 'selection_required'; messageId: string }
  | { status: 'busy'; reason?: string }
  | { status: 'not_ready'; reason: string }
  | { status: 'rejected'; reason: string }

export type VerbexChatSubmissionOptions = {
  scope?: HwpEditScope
}

export type KordocProviderToolName = (typeof KORDOC_PROVIDER_TOOL_NAMES)[number]

export type KordocProviderPath = string & {
  readonly __kordocVaultPath: unique symbol
}

export type KordocProviderContext = {
  runId?: string
  turnId?: string
  registrySnapshotId?: string
  providerGeneration?: string
}

export type KordocSemanticChange = {
  blockIndex: number
  kind: 'text' | 'cell'
  row?: number
  col?: number
  beforePreview: string
  afterPreview: string
}

export type KordocBinaryChangeDraft = {
  kind: 'binary-change-draft'
  providerId: typeof KORDOC_PROVIDER_ID
  providerProtocolVersion: typeof KORDOC_PROVIDER_PROTOCOL_VERSION
  providerVersion: string
  targetPath: KordocProviderPath | string
  sourceHash: string
  resultHash: string
  baseSessionRevision: number
  resultSessionRevision: number
  applied: number
  changes: KordocSemanticChange[]
  data: Uint8Array
  context?: KordocProviderContext
}

export type KordocPrepareSummary = {
  targetPath: KordocProviderPath | string
  sourceHash: string
  resultHash: string
  baseSessionRevision: number
  resultSessionRevision: number
  applied: number
  changes: KordocSemanticChange[]
  requiresHostApproval: true
  containsBinaryData: false
}

export type KordocProviderManifest = {
  providerId: string
  protocolVersion: number
  schemaVersion: string
  schemaHash: string
  providerVersion: string
  capabilities: {
    inspectDocument: boolean
    inspectBlocks: boolean
    prepareBlockPatch: boolean
    validateHwpx: boolean
    binaryDraft: boolean
    commit: false
  }
  llmToolNames: readonly string[]
}

export type KordocDraftValidation = {
  ok: boolean
  resultHash: string
  entryCount?: number
  issues: { path?: string; message: string }[]
}

export type KordocProvider = {
  getManifest(): Promise<KordocProviderManifest>
  /** Optional host-only metadata: documents currently open in companion views. */
  openDocumentPaths?(): Promise<string[]>
  inspectDocument(input: { path: string }): Promise<unknown>
  inspectBlocks(input: {
    path: string
    offset?: number
    limit?: number
  }): Promise<unknown>
  prepareBlockPatch(input: {
    path: string
    sessionRevision: number
    edits: unknown[]
    context?: KordocProviderContext
  }): Promise<{
    draft: KordocBinaryChangeDraft
    summary: KordocPrepareSummary
  }>
  validateDraft(draft: KordocBinaryChangeDraft): Promise<KordocDraftValidation>
  dispose(): void
}

export type ProviderRegistration = { dispose(): void }

export type ProviderRegistryApi = {
  protocolVersion: typeof VERBEX_PROVIDER_HOST_PROTOCOL_VERSION
  generation: string
  registerProvider(provider: KordocProvider): ProviderRegistration
}

export type VerbexChatApi = {
  protocolVersion: typeof VERBEX_CHAT_HOST_PROTOCOL_VERSION
  sendMessage(message: string): Promise<boolean>
  sendMessageV2?(
    message: string,
    options?: VerbexChatSubmissionOptions,
  ): Promise<ChatSubmissionResult>
}

export type ProviderToolDefinition = RequestTool & {
  function: RequestTool['function'] & { name: KordocProviderToolName }
}

export type BinaryProposalSummary = {
  proposalId: string
  providerId: string
  providerVersion: string
  targetPath: string
  sourceHash: string
  resultHash: string
  sourceSizeBytes: number
  resultSizeBytes: number
  baseSessionRevision: number
  resultSessionRevision: number
  applied: number
  changes: KordocSemanticChange[]
  createdAt: string
  expiresAt: string
  registrySnapshotId: string
  runId?: string
  turnId?: string
}

export type ProviderToolResult =
  | { kind: 'read'; text: string }
  | {
      kind: 'outcome'
      outcome: import('../core/llm/toolOutcome').AgentToolOutcome
    }
  | { kind: 'error'; message: string }

export function normalizeProviderPath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('provider path must be a string')
  }
  const raw = value.trim().replace(/\\/g, '/')
  if (!raw || /^(?:[A-Za-z]:|\/)/.test(raw)) {
    throw new Error('provider path must be a vault-relative path')
  }
  if ([...raw].some((char) => char.charCodeAt(0) < 0x20)) {
    throw new Error('provider path cannot contain control characters')
  }
  const parts = raw.split('/')
  if (parts.some((part) => part === '..')) {
    throw new Error('provider path cannot contain ..')
  }
  const normalized = parts.filter((part) => part && part !== '.').join('/')
  if (!normalized) throw new Error('provider path cannot be empty')
  return normalized
}
