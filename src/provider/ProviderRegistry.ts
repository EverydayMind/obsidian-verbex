import { App } from 'obsidian'

import { runtimeGlobal } from '../platform/runtime'
import { isAiPrivatePath } from '../security/aiPrivatePaths'
import { aiPrivateRefusalOutcome } from '../security/aiPrivateRefusal'
import { sha256HexBytes } from '../utils/hash'

import {
  BinaryCommitPipeline,
  BinaryCommitResult,
} from './BinaryCommitPipeline'
import { binaryToolOutcome } from './binaryToolOutcome'
import { companionOwnershipPaths } from './companionOwnership'
import {
  BinaryProposalSummary,
  HwpEditScope,
  KORDOC_PROVIDER_ID,
  KORDOC_PROVIDER_PROTOCOL_VERSION,
  KORDOC_PROVIDER_SCHEMA_HASH,
  KORDOC_PROVIDER_SCHEMA_VERSION,
  KORDOC_PROVIDER_TOOL_NAMES,
  KordocProvider,
  KordocProviderManifest,
  ProviderRegistration,
  ProviderRegistryApi,
  ProviderToolDefinition,
  ProviderToolResult,
  normalizeProviderPath,
} from './contract'
import type { DocumentOwnershipPolicy } from './DocumentOwnershipPolicy'
import { registrationUnverified } from './ownershipQueryText'
import {
  BinaryProposal,
  BinaryProposalStore,
  ProposalStoreOptions,
} from './proposalStore'

export type BinaryProposalApprovalHandler = (
  proposal: BinaryProposalSummary,
) => Promise<boolean>

export type ProviderRegistryOptions = ProposalStoreOptions & {
  /** Host UI callback. Validation/checkpoint/commit remain registry-owned. */
  binaryProposalApproval?: BinaryProposalApprovalHandler
}

export type ProviderRegistrySnapshot = Readonly<{
  browserImages?: boolean
  /** Turn-owned presentation metadata; grants no execution authority. */
  documentJobTrigger?: 'explicit' | 'structural'
  documentJobExplicitJobIds?: readonly string[]
  caller?: Readonly<{ conversationId: string; submittedTurnId: string }>
  mcpIdentities?: Readonly<
    Record<string, import('../core/mcp/toolCatalog').McpToolIdentity>
  >
  connectorIdentities?: Readonly<Record<string, string>>
  nativeIdentities?: Readonly<Record<string, string>>
  /** Editor context captured when the turn was submitted. Never refreshed mid-run. */
  browserContext?: import('./interop/browserContext').BrowserTurnContext
  turnScope?: import('./interop/turnScope').NativeTurnScope
  /** Which provider observations the model was actually shown in this run. */
  observations?: import('./interop/observationLedger').ObservationLedger
  snapshotId: string
  protocolVersion: typeof KORDOC_PROVIDER_PROTOCOL_VERSION
  generation: string
  providers: readonly Readonly<{
    providerId: string
    providerVersion: string
    schemaVersion: string
    toolNames: readonly string[]
  }>[]
  toolNames: readonly string[]
}>

export type ProviderExecutionContext = {
  signal?: AbortSignal
  onConnectorAudit?: (
    fact: import('./connectors/PluginConnectorHost').ConnectorAudit,
  ) => void
  runId?: string
  turnId?: string
  /** Native providers tell the conversation and the submitted turn apart from the tool call. */
  conversationId?: string
  submittedTurnId?: string
  snapshot?: ProviderRegistrySnapshot
  scope?: HwpEditScope
}

type ProviderRecord = {
  provider: KordocProvider
  manifest: KordocProviderManifest | null
  load: Promise<KordocProviderManifest | null>
}

const TOOL_DEFINITIONS: Record<string, ProviderToolDefinition> = {
  kordoc__inspect_document: {
    type: 'function',
    function: {
      name: 'kordoc__inspect_document',
      description:
        'Return HWPX metadata only: pageCount, blockCount, sessionRevision, warnings. No text; use kordoc__inspect_blocks for text previews.',
      parameters: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            minLength: 1,
            description:
              'Vault path of a .hwpx file. Markdown, .hwp and other formats are rejected.',
          },
        },
      },
    },
  },
  kordoc__inspect_blocks: {
    type: 'function',
    function: {
      name: 'kordoc__inspect_blocks',
      description:
        'List HWPX blocks with blockIndex, type, a short textPreview (up to 240 chars), edit capability and the sessionRevision that kordoc__prepare_block_patch needs. Call this before preparing a patch: handles or ids from other document tools are not block indexes. A page holds at most 50 blocks; continue from nextOffset. Table cell text is not listed, only the editable row/col coordinates (0-based).',
      parameters: {
        type: 'object',
        required: ['path'],
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            minLength: 1,
            description:
              'Vault path of a .hwpx file. Markdown, .hwp and other formats are rejected.',
          },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
    },
  },
  kordoc__prepare_block_patch: {
    type: 'function',
    function: {
      name: 'kordoc__prepare_block_patch',
      description:
        "Prepare an HWPX text replacement proposal and, if the host approval UI accepts it, save the whole proposal within this call. The result reports prepared, rejected, applied or failed/unknown with a checkpoint receipt when a write was attempted. Does not read cell text, sort/reorder rows, insert paragraphs or change formatting. If another editor owns an open or held working copy, use that editor's exposed editing tools. Take blockIndex and sessionRevision from kordoc__inspect_blocks. A text block takes newText; a table takes cells with 0-based row/col. One call changes at most 16 blocks. Submit real replacement text, never placeholders or edits made to discover existing content.",
      parameters: {
        type: 'object',
        required: ['path', 'sessionRevision', 'edits'],
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            minLength: 1,
            description:
              'Vault path of a .hwpx file. Markdown, .hwp and other formats are rejected.',
          },
          sessionRevision: { type: 'integer', minimum: 0 },
          edits: {
            type: 'array',
            minItems: 1,
            maxItems: 16,
            items: {
              type: 'object',
              required: ['blockIndex'],
              additionalProperties: false,
              properties: {
                blockIndex: { type: 'integer', minimum: 0 },
                newText: {
                  type: 'string',
                  minLength: 1,
                  maxLength: 20000,
                  pattern: '\\S',
                },
                cells: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 128,
                  items: {
                    type: 'object',
                    required: ['row', 'col', 'text'],
                    additionalProperties: false,
                    properties: {
                      row: { type: 'integer', minimum: 0 },
                      col: { type: 'integer', minimum: 0 },
                      text: { type: 'string', maxLength: 20000 },
                    },
                  },
                },
              },
              oneOf: [
                { required: ['newText'], not: { required: ['cells'] } },
                { required: ['cells'], not: { required: ['newText'] } },
              ],
            },
          },
        },
      },
    },
  },
}

const MAX_PATCH_EDITS = 16
const MAX_CELL_EDITS = 128
const MAX_TEXT_CHARS = 20_000
const MAX_PATCH_BYTES = 65_536
const CANONICAL_PATCH_ERROR =
  'Each edit must contain blockIndex and exactly one of newText or cells. ' +
  'Example: {"blockIndex":0,"cells":[{"row":0,"col":0,"text":"replacement"}]}'
/** Appended to provider patch failures; the provider's own message is kept verbatim. */
const PATCH_FAILURE_HINT =
  ' Check the block with kordoc__inspect_blocks: blockIndex and sessionRevision come from its result, a table block needs cells:[{row,col,text}] (0-based) instead of newText, and a locked block cannot be edited.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePatchEdits(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return 'edits must contain at least one block edit.'
  }
  if (raw.length > MAX_PATCH_EDITS) {
    return `edits may contain at most ${MAX_PATCH_EDITS} block edits.`
  }
  try {
    if (
      new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_PATCH_BYTES
    ) {
      return `patch payload exceeds ${MAX_PATCH_BYTES} bytes.`
    }
  } catch {
    return 'edits must be JSON-serializable.'
  }
  const blockIndexes = new Set<number>()
  for (const edit of raw) {
    if (!isRecord(edit)) return CANONICAL_PATCH_ERROR
    const keys = Object.keys(edit)
    if (keys.some((key) => !['blockIndex', 'newText', 'cells'].includes(key))) {
      return CANONICAL_PATCH_ERROR
    }
    if (!Number.isInteger(edit.blockIndex) || (edit.blockIndex as number) < 0) {
      return 'blockIndex must be a non-negative integer.'
    }
    const blockIndex = edit.blockIndex as number
    if (blockIndexes.has(blockIndex)) {
      return `blockIndex=${blockIndex} appears more than once in edits.`
    }
    blockIndexes.add(blockIndex)
    const hasNewText = Object.prototype.hasOwnProperty.call(
      edit,
      'newText',
    ) as boolean
    const hasCells = Object.prototype.hasOwnProperty.call(
      edit,
      'cells',
    ) as boolean
    if (hasNewText === hasCells) return CANONICAL_PATCH_ERROR
    if (hasNewText) {
      if (typeof edit.newText !== 'string' || !edit.newText.trim()) {
        return 'newText must be a non-empty string.'
      }
      if (edit.newText.length > MAX_TEXT_CHARS) {
        return `newText may contain at most ${MAX_TEXT_CHARS} characters.`
      }
      continue
    }
    if (!Array.isArray(edit.cells) || edit.cells.length === 0) {
      return CANONICAL_PATCH_ERROR
    }
    if (edit.cells.length > MAX_CELL_EDITS) {
      return `cells may contain at most ${MAX_CELL_EDITS} cell edits per block.`
    }
    const coordinates = new Set<string>()
    for (const cell of edit.cells) {
      if (!isRecord(cell)) return CANONICAL_PATCH_ERROR
      const cellKeys = Object.keys(cell)
      if (cellKeys.some((key) => !['row', 'col', 'text'].includes(key))) {
        return CANONICAL_PATCH_ERROR
      }
      if (
        !Number.isInteger(cell.row) ||
        (cell.row as number) < 0 ||
        !Number.isInteger(cell.col) ||
        (cell.col as number) < 0 ||
        typeof cell.text !== 'string'
      ) {
        return 'each cell requires non-negative integer row/col and string text.'
      }
      const row = cell.row as number
      const col = cell.col as number
      if (cell.text.length > MAX_TEXT_CHARS) {
        return `cell text may contain at most ${MAX_TEXT_CHARS} characters.`
      }
      const coordinate = `${row}:${col}`
      if (coordinates.has(coordinate)) {
        return `cell coordinate ${coordinate} appears more than once in one block edit.`
      }
      coordinates.add(coordinate)
    }
  }
  return null
}

function validateCompanionScope(
  scope: HwpEditScope | undefined,
  path: string,
  edits: unknown[],
): string | null {
  if (!scope) return null
  if (scope.path !== path)
    return 'companion scope path does not match the provider path.'
  if (
    typeof scope.contextId !== 'string' ||
    !scope.contextId.trim() ||
    scope.contextId.length > 128
  ) {
    return 'companion scope contextId must be a non-empty value of at most 128 characters.'
  }
  if (scope.scope === 'document') return null
  const lockedBlockIndex = scope.blockIndex
  if (
    typeof lockedBlockIndex !== 'number' ||
    !Number.isInteger(lockedBlockIndex) ||
    lockedBlockIndex < 0
  ) {
    return 'single-block companion scope requires a non-negative blockIndex.'
  }
  if (!scope.blockType) {
    return 'single-block companion scope requires blockType.'
  }
  for (const edit of edits) {
    if (!isRecord(edit) || edit.blockIndex !== scope.blockIndex) {
      return `companion scope requires blockIndex=${lockedBlockIndex}.`
    }
    const hasCells = Array.isArray(edit.cells)
    const hasNewText = typeof edit.newText === 'string'
    if (scope.blockType === 'table' && (!hasCells || hasNewText)) {
      return CANONICAL_PATCH_ERROR
    }
    if (scope.blockType !== 'table' && (hasCells || !hasNewText)) {
      return 'companion scope requires newText for a paragraph or heading block.'
    }
    if (scope.targetCell) {
      const cells = Array.isArray(edit.cells) ? edit.cells : []
      if (cells.length !== 1) {
        return 'companion scope permits exactly one target cell in the patch.'
      }
      const found = cells.some(
        (cell) =>
          isRecord(cell) &&
          cell.row === scope.targetCell?.row &&
          cell.col === scope.targetCell?.col,
      )
      if (!found) return 'companion scope targetCell is missing from the patch.'
    }
    // A truncated capability preview is context only, not an authorization
    // allowlist. The provider re-checks editable coordinates during prepare.
    if (scope.tableCells && !scope.tableCellsTruncated) {
      const allowed = new Set(
        scope.tableCells.map((cell) => `${cell.row}:${cell.col}`),
      )
      const cells = Array.isArray(edit.cells) ? edit.cells : []
      if (
        cells.some(
          (cell) =>
            !isRecord(cell) ||
            !allowed.has(`${String(cell.row)}:${String(cell.col)}`),
        )
      ) {
        return 'companion scope contains a cell outside the selected editable cells.'
      }
    }
  }
  return null
}

function assertScopedSourceHash(
  scope: HwpEditScope | undefined,
  path: string,
  sourceHash: string,
): void {
  if (!scope) return
  if (scope.path !== path)
    throw new Error('companion scope path does not match the provider path.')
  if (scope.sourceHash !== sourceHash) {
    throw new Error(
      'companion scope sourceHash is stale for the current Vault bytes.',
    )
  }
}

function newId(prefix: string): string {
  const cryptoApi = runtimeGlobal().crypto
  return `${prefix}-${cryptoApi?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

/** Runtime provider catalog and the only host entry point for provider tools. */
export class ProviderRegistry implements ProviderRegistryApi {
  readonly protocolVersion = KORDOC_PROVIDER_PROTOCOL_VERSION
  readonly generation: string
  readonly proposals: BinaryProposalStore
  readonly binaryPipeline: BinaryCommitPipeline
  documentOwnership?: DocumentOwnershipPolicy
  private readonly records = new Map<string, ProviderRecord>()
  private readonly consumedCompanionContexts = new Set<string>()
  private readonly app: App
  private disposed = false
  private readonly readyListeners = new Set<() => void>()
  private binaryProposalApproval?: BinaryProposalApprovalHandler

  constructor(
    app: import('obsidian').App,
    options: ProviderRegistryOptions = {},
  ) {
    this.app = app
    const { binaryProposalApproval, ...proposalOptions } = options
    this.binaryProposalApproval = binaryProposalApproval
    this.generation = newId('registry')
    this.proposals = new BinaryProposalStore(proposalOptions)
    this.binaryPipeline = new BinaryCommitPipeline(app, this.proposals)
  }

  /**
   * Installs the host-owned approval surface after the plugin UI is ready.
   * The callback receives only the redacted semantic proposal summary; binary
   * bytes stay in the registry's bounded store.
   */
  setBinaryProposalApprovalHandler(
    handler: BinaryProposalApprovalHandler | undefined,
  ): void {
    this.binaryProposalApproval = handler
  }

  registerProvider(provider: KordocProvider): ProviderRegistration {
    this.ensureActive()
    const registrationId = newId('registration')
    let active = true
    const record: ProviderRecord = {
      provider,
      manifest: null,
      load: Promise.resolve(null),
    }
    this.records.set(registrationId, record)
    const load = provider
      .getManifest()
      .then((manifest) => {
        if (!active || this.disposed) {
          if (this.records.get(registrationId) === record) {
            this.records.delete(registrationId)
          }
          return null
        }
        this.validateManifest(manifest)
        for (const [key, existing] of this.records) {
          if (key === registrationId || existing.provider === provider) continue
          if (existing.manifest?.providerId !== manifest.providerId) continue
          this.records.delete(key)
          existing.provider.dispose()
          this.proposals.clear()
        }
        record.manifest = manifest
        for (const listener of this.readyListeners) listener()
        return manifest
      })
      .catch((error) => {
        console.warn('[Verbex] provider registration rejected', error)
        // A record that already holds a manifest was accepted; a later throw
        // (a ready listener) must not unregister it.
        if (!record.manifest && this.records.get(registrationId) === record) {
          this.records.delete(registrationId)
          // The registration handle becomes a no-op: no second dispose.
          active = false
          try {
            provider.dispose()
          } catch {
            // Ignore disposal errors from already-disposed providers.
          }
          for (const listener of this.readyListeners) {
            try {
              listener()
            } catch (listenerError) {
              console.warn(
                '[Verbex] provider ready listener failed',
                listenerError,
              )
            }
          }
        }
        return null
      })
    record.load = load
    return {
      dispose: () => {
        if (!active) return
        active = false
        for (const [key, record] of this.records) {
          if (record.provider !== provider) continue
          this.records.delete(key)
        }
        provider.dispose()
        this.proposals.clear()
      },
    }
  }

  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener)
    return () => this.readyListeners.delete(listener)
  }

  /** Local metadata only; never a model tool or an edit grant. No stale cache. */
  async openDocumentPaths(): Promise<string[]> {
    this.ensureActive()
    if ([...this.records.values()].some((record) => !record.manifest))
      throw new Error(registrationUnverified())
    const records = [...this.records.values()].filter(
      (record) => record.manifest,
    )
    const paths = await Promise.all(
      records.map((record) =>
        companionOwnershipPaths(
          record.provider,
          () => !this.disposed && [...this.records.values()].includes(record),
          this.app,
        ),
      ),
    )
    return [...new Set(paths.flat())]
  }

  async getSnapshot(): Promise<ProviderRegistrySnapshot> {
    this.ensureActive()
    await Promise.all(
      [...this.records.values()].map(async (record) => {
        try {
          await record.load
        } catch {
          // Invalid providers are omitted from the immutable snapshot.
        }
      }),
    )
    return this.createSnapshot()
  }

  createSnapshot(): ProviderRegistrySnapshot {
    this.ensureActive()
    const providers = [...this.records.values()]
      .map((record) => record.manifest)
      .filter(
        (manifest): manifest is KordocProviderManifest => manifest !== null,
      )
      .map((manifest) =>
        Object.freeze({
          providerId: manifest.providerId,
          providerVersion: manifest.providerVersion,
          schemaVersion: manifest.schemaVersion,
          toolNames: Object.freeze(
            manifest.llmToolNames.filter((name) =>
              (KORDOC_PROVIDER_TOOL_NAMES as readonly string[]).includes(name),
            ),
          ),
        }),
      )
    const toolNames = Object.freeze(
      providers.flatMap((provider) => [...provider.toolNames]),
    )
    return Object.freeze({
      snapshotId: newId('turn'),
      protocolVersion: this.protocolVersion,
      generation: this.generation,
      providers: Object.freeze(providers),
      toolNames,
    })
  }

  getAgentToolDefinitions(): ProviderToolDefinition[] {
    if (this.disposed) return []
    const names = new Set(
      [...this.records.values()].flatMap(
        (record) => record.manifest?.llmToolNames ?? [],
      ),
    )
    return KORDOC_PROVIDER_TOOL_NAMES.filter((name) => names.has(name)).map(
      (name) => TOOL_DEFINITIONS[name],
    )
  }

  hasTool(name: string): boolean {
    return this.getAgentToolDefinitions().some(
      (definition) => definition.function.name === name,
    )
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ProviderExecutionContext = {},
  ): Promise<ProviderToolResult> {
    this.ensureActive()
    const record = this.findRecordForTool(name)
    if (!record)
      return { kind: 'error', message: `Unknown provider tool: ${name}` }
    const providerContext = {
      ...(context.runId ? { runId: context.runId } : {}),
      ...(context.turnId ? { turnId: context.turnId } : {}),
      registrySnapshotId: context.snapshot?.snapshotId ?? newId('turn'),
      providerGeneration: this.generation,
    }
    try {
      const path = normalizeProviderPath(args.path)
      // An outcome, not an error: the refusal carries mutationScope 'none'
      // for the patch tool too.
      if (isAiPrivatePath(path))
        return { kind: 'outcome', outcome: aiPrivateRefusalOutcome(path) }
      if (name === 'kordoc__inspect_document') {
        const inspection = await record.provider.inspectDocument({ path })
        if (isRecord(inspection) && typeof inspection.sourceHash === 'string') {
          assertScopedSourceHash(context.scope, path, inspection.sourceHash)
        }
        return {
          kind: 'read',
          text: JSON.stringify(inspection),
        }
      }
      if (name === 'kordoc__inspect_blocks') {
        const blocks = await record.provider.inspectBlocks({
          path,
          ...(typeof args.offset === 'number' ? { offset: args.offset } : {}),
          ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
        })
        if (isRecord(blocks) && typeof blocks.sourceHash === 'string') {
          assertScopedSourceHash(context.scope, path, blocks.sourceHash)
        }
        return {
          kind: 'read',
          text: JSON.stringify(blocks),
        }
      }
      if (name !== 'kordoc__prepare_block_patch') {
        return {
          kind: 'error',
          message: `Provider tool is not exposed: ${name}`,
        }
      }
      if (
        !Number.isInteger(args.sessionRevision) ||
        (args.sessionRevision as number) < 0
      ) {
        return {
          kind: 'error',
          message: 'sessionRevision must be a non-negative integer.',
        }
      }
      const editError = validatePatchEdits(args.edits)
      if (editError) return { kind: 'error', message: editError }
      const scopeError = validateCompanionScope(
        context.scope,
        path,
        args.edits as unknown[],
      )
      if (scopeError) return { kind: 'error', message: scopeError }
      if (
        context.scope?.contextId &&
        this.consumedCompanionContexts.has(context.scope.contextId)
      ) {
        return {
          kind: 'error',
          message:
            'companion scope contextId has already been consumed; issue a new edit request.',
        }
      }
      if (context.scope) {
        const source = await this.readSourceInfo(path)
        assertScopedSourceHash(context.scope, path, source.hash)
      }
      await this.documentOwnership?.assertAvailable(path, { kind: 'legacy' })
      const prepared = await record.provider.prepareBlockPatch({
        path,
        sessionRevision: args.sessionRevision as number,
        edits: args.edits as unknown[],
        context: providerContext,
      })
      const draft = {
        ...prepared.draft,
        targetPath: normalizeProviderPath(prepared.draft.targetPath),
        data: new Uint8Array(prepared.draft.data),
        context: providerContext,
      }
      const source = await this.readSourceInfo(draft.targetPath)
      if (source.hash !== draft.sourceHash) {
        throw new Error(
          `provider draft sourceHash does not match the current Vault bytes for ${draft.targetPath}`,
        )
      }
      const proposal = await this.proposals.put({
        draft,
        registrySnapshotId: providerContext.registrySnapshotId,
        providerGeneration: this.generation,
        sourceSizeBytes: source.sizeBytes,
      })
      if (context.scope?.contextId) {
        // A scope is a one-shot capability. It remains valid across inspect
        // calls and proposal approval, but cannot be replayed for a second
        // patch after a proposal has been created.
        this.consumedCompanionContexts.add(context.scope.contextId)
        if (this.consumedCompanionContexts.size > 1024) {
          const oldest = this.consumedCompanionContexts.values().next()
            .value as string | undefined
          if (oldest) this.consumedCompanionContexts.delete(oldest)
        }
      }
      await this.binaryPipeline.validate(proposal.proposalId, (candidate) =>
        record.provider.validateDraft(candidate),
      )
      const validated = this.proposals.get(proposal.proposalId)
      if (!validated) throw new Error('proposal disappeared during validation')
      const summary = publicSummary(validated)
      if (this.binaryProposalApproval) {
        let approved = false
        try {
          approved = await this.binaryProposalApproval(summary)
        } catch (error) {
          this.proposals.reject(proposal.proposalId)
          return binaryToolOutcome(
            proposal.proposalId,
            validated.targetPath,
            error instanceof Error ? error : new Error(String(error)),
          )
        }
        if (!approved) {
          this.proposals.reject(proposal.proposalId)
          return binaryToolOutcome(
            proposal.proposalId,
            validated.targetPath,
            'rejected',
          )
        }
        try {
          const receipt = await this.approveAndCommit(proposal.proposalId, true)
          if (!receipt)
            throw new Error('approved binary proposal returned no receipt')
          return binaryToolOutcome(
            proposal.proposalId,
            validated.targetPath,
            receipt,
          )
        } catch (error) {
          return binaryToolOutcome(
            proposal.proposalId,
            validated.targetPath,
            error instanceof Error ? error : new Error(String(error)),
          )
        }
      }
      return {
        kind: 'read',
        text: JSON.stringify({
          state: 'prepared',
          proposalId: validated.proposalId,
          summary,
          expiresAt: validated.expiresAt,
        }),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        kind: 'error',
        message:
          name === 'kordoc__prepare_block_patch'
            ? message + PATCH_FAILURE_HINT
            : message,
      }
    }
  }

  async approveAndCommit(
    proposalId: string,
    approved: boolean,
  ): Promise<BinaryCommitResult | null> {
    if (!approved) {
      this.proposals.reject(proposalId)
      return null
    }
    await this.binaryPipeline.approve(proposalId, true)
    return this.binaryPipeline.commit(proposalId)
  }

  async approve(
    proposalId: string,
    approved: boolean,
  ): Promise<BinaryProposal | null> {
    if (!approved) {
      this.proposals.reject(proposalId)
      return null
    }
    return this.binaryPipeline.approve(proposalId, true)
  }

  async commit(proposalId: string): Promise<BinaryCommitResult> {
    return this.binaryPipeline.commit(proposalId)
  }

  async restoreBinaryCheckpoint(
    runId: string,
    checkpointId: string,
  ): Promise<void> {
    await this.binaryPipeline.restore(runId, checkpointId)
  }

  invalidateRun(runId: string): number {
    return this.proposals.invalidateRun(runId)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.proposals.clear()
    for (const record of this.records.values()) record.provider.dispose()
    this.records.clear()
    this.consumedCompanionContexts.clear()
    this.readyListeners.clear()
  }

  private findRecordForTool(name: string): ProviderRecord | null {
    for (const record of this.records.values()) {
      if (record.manifest?.llmToolNames.includes(name)) return record
    }
    return null
  }

  private validateManifest(manifest: KordocProviderManifest): void {
    if (
      manifest.providerId !== KORDOC_PROVIDER_ID ||
      manifest.protocolVersion !== KORDOC_PROVIDER_PROTOCOL_VERSION ||
      manifest.schemaVersion !== KORDOC_PROVIDER_SCHEMA_VERSION ||
      manifest.schemaHash !== KORDOC_PROVIDER_SCHEMA_HASH ||
      manifest.capabilities.commit ||
      !manifest.capabilities.binaryDraft ||
      !manifest.capabilities.inspectDocument ||
      !manifest.capabilities.inspectBlocks ||
      !manifest.capabilities.prepareBlockPatch ||
      !manifest.capabilities.validateHwpx
    ) {
      throw new Error('provider manifest is incompatible with host protocol 1')
    }
    const names = [...manifest.llmToolNames].sort()
    const expectedNames = [...KORDOC_PROVIDER_TOOL_NAMES].sort()
    if (
      names.length !== expectedNames.length ||
      names.some((name, index) => name !== expectedNames[index])
    ) {
      throw new Error(
        'provider manifest exposes a tool outside the fixed contract',
      )
    }
  }

  private async readSourceInfo(pathInput: string): Promise<{
    hash: string
    sizeBytes: number
  }> {
    const path = normalizeProviderPath(pathInput)
    const file = this.app.vault.getAbstractFileByPath(path)
    if (!file || typeof (file as { path?: unknown }).path !== 'string') {
      throw new Error(`provider draft target is missing: ${path}`)
    }
    const bytes = new Uint8Array(
      await this.app.vault.readBinary(
        file as Parameters<typeof this.app.vault.readBinary>[0],
      ),
    )
    return { hash: await sha256HexBytes(bytes), sizeBytes: bytes.byteLength }
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('provider registry is disposed')
  }
}

function publicSummary(proposal: BinaryProposal): BinaryProposalSummary {
  return {
    proposalId: proposal.proposalId,
    providerId: proposal.providerId,
    providerVersion: proposal.providerVersion,
    targetPath: proposal.targetPath,
    sourceHash: proposal.sourceHash,
    resultHash: proposal.resultHash,
    sourceSizeBytes: proposal.sourceSizeBytes,
    resultSizeBytes: proposal.resultSizeBytes,
    baseSessionRevision: proposal.baseSessionRevision,
    resultSessionRevision: proposal.resultSessionRevision,
    applied: proposal.applied,
    changes: proposal.changes,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
    registrySnapshotId: proposal.registrySnapshotId,
    ...(proposal.runId ? { runId: proposal.runId } : {}),
    ...(proposal.turnId ? { turnId: proposal.turnId } : {}),
  }
}
