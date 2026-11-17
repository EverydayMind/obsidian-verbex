import type { BatchContract } from '../core/batch/contracts'

export type PlanStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'skipped'
  | 'failed'

export type RunStatus =
  | 'created'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled'

export type VerbexPlanStep = {
  id: string
  title: string
  description?: string
  status: PlanStepStatus
  dependsOn: string[]
  workflowStepId?: string
}

export type VerbexRunState = {
  schemaVersion: 2
  id: string
  status: RunStatus
  title: string
  createdAt: string
  updatedAt: string
  skill: string | null
  workflow: string | null
  plan: VerbexPlanStep[]
  currentStepId: string | null
  logs: {
    timestamp: string
    level: 'info' | 'warn' | 'error'
    message: string
  }[]
  artifacts: Record<string, string>
  /** Ids of checkpoints created during the run, oldest first. */
  checkpoints: string[]
}

export type OperationCategory =
  | 'read'
  | 'write'
  | 'delete'
  | 'move'
  | 'external_api'

/**
 * A single proposed file mutation produced by a Local Tool. Tools never write
 * directly; they return a change that flows through the Diff / approval /
 * checkpoint pipeline before being applied to the vault.
 */
export type FileChangeOp = 'create' | 'modify' | 'rename' | 'move' | 'delete'

/** Drives how the Diff view labels and groups a change. */
export type ChangeKind =
  | 'frontmatter'
  | 'body'
  | 'rename'
  | 'move'
  | 'delete'
  | 'create'
  | 'link'

export type SourceDependency = {
  /** Canonical vault-relative source path captured when a proposal is built. */
  path: string
  /** Source content captured with the proposal; null means it did not exist. */
  beforeContent: string | null
}

export type BinarySourceDependency = { path: string; sha256Before: string }

/** One file a composite change may touch; every entry is checkpointed first. */
export type CompositeChangeEntry = {
  op: FileChangeOp
  path: string
  /** Pre-rename path for a rename entry. */
  originalPath?: string
  /** Content when the proposal was built; null when the file must not exist. */
  before: string | null
  /** Expected content, null for removal, undefined when Obsidian decides it. */
  after?: string | null
}

/**
 * A change whose apply is delegated to a registered composite applier (for
 * example Obsidian's Note Composer). The primary change fields describe the
 * main file for the Diff view; `entries` is the full predicted write set.
 */
export type CompositeChange = {
  operation:
    | 'write_set'
    | 'note_merge'
    | 'note_extract'
    | 'note_rename'
    | 'file_trash'
  entries: CompositeChangeEntry[]
  /** JSON-only arguments the applier needs; bound into the apply permit. */
  params: Record<string, string | number | boolean | null>
}

export type ProposedChange = {
  /** Stable id within a step's change set. */
  id: string
  op: FileChangeOp
  kind: ChangeKind
  /** Resulting vault path (the new path for rename/move). */
  path: string
  /** Source path for rename/move/delete; undefined for create/modify. */
  originalPath?: string
  /** Content before the change; null when the file is being created. */
  before: string | null
  /** Content after the change; null when the file is being deleted. */
  after: string | null
  /**
   * Risky operations (delete / move) that must always be explicitly approved
   * and are excluded from Auto Mode.
   */
  dangerous: boolean
  /** Which tool produced the change, for logs / verification. */
  tool: string
  /**
   * Additional optimistic locks for server-side compositions such as copy and
   * combine. These sources are checked immediately before checkpoint/apply.
   */
  sourceDependencies?: SourceDependency[]
  /** Byte-exact read preconditions, never checkpoint/rollback targets. */
  binarySourceDependencies?: BinarySourceDependency[]
  /** Structured documents must be approved/rejected as one unit. */
  approvalMode?: 'whole_change'
  /** Facts the approval view lists beside the Diff (affected files, trash). */
  approvalNotes?: string[]
  /** Multi-file change applied by a composite applier; always whole-change. */
  composite?: CompositeChange
}

export type HunkDecision = 'approved' | 'rejected'

export type ApprovalStatus = 'approved' | 'rejected' | 'partial_approved'

/**
 * Outcome of reviewing one change in the Diff view. `partial_approved` carries
 * the per-hunk decisions so the executor can write only the approved hunks and
 * feed the rejected ones (with a reason) back to the LLM.
 */
export type ChangeApproval = {
  changeId: string
  status: ApprovalStatus
  approvedHunks: number[]
  rejectedHunks: number[]
  /** User / Auto Mode reason, surfaced in logs and LLM re-prompts. */
  reason?: string
}

export type CheckpointEntry = {
  path: string
  originalPath?: string
  op: FileChangeOp
  /** SHA-256 of the pre-change content; null when the file did not exist. */
  beforeHash: string | null
  /** Snapshot file (checkpoint-relative); null for a create (nothing to keep). */
  snapshotRef: string | null
  /** Present only when this entry was successfully applied; null means deletion. */
  afterHash?: string | null
}

export type CheckpointRecord = {
  appliedAt?: string
  restoredAt?: string
  id: string
  runId: string
  createdAt: string
  entries: CheckpointEntry[]
  /** Total bytes of snapshot content, for the retention budget. */
  sizeBytes: number
  /**
   * Batch identifier set by {@link StepExecutor.processBatch} when multiple
   * files are checkpointed together as a single atomic unit. Undefined for
   * individual (non-batch) checkpoints. Consumers can use this to group
   * related checkpoints for targeted batch rollback or UI display.
   */
  batchId?: string
}

export type SkillFrontmatter = {
  name: string
  /**
   * Claude Code skills declare when to use the skill via `description`. This is
   * the canonical field; `summary` is kept for backward compatibility with the
   * original Verbex skill frontmatter.
   */
  description?: string
  summary?: string
  workflow?: string
  trigger_keywords: string[]
  applies_to?: string[]
  /** Claude Code `allowed-tools` frontmatter (parsed, not yet enforced). */
  allowedTools?: string[]
  /** Specialist tools exposed while this skill is active. */
  tools?: string[]
  /** `preferred-tools`: plugin tools reserved, without forcing, while active. */
  preferredTools?: string[]
  requiredPlugins?: string[]
  /** The skill requires cross-document reasoning. */
  cross_document?: boolean
  /** The skill body is a complete procedure: when its trigger keywords
   *  activate it, a workflow guide suggested only by the LLM selector is not
   *  attached. A workflow the skill itself declares still is. */
  standalone?: boolean
  /** Claude Code `disable-model-invocation`: only explicit user selection may activate this skill. */
  disableModelInvocation?: boolean
  /** Standalone large-document processing defaults (parsed in M6). */
  batch?: BatchContract
}

export type SkillSummary = SkillFrontmatter & {
  /** Path to the skill markdown file (`SKILL.md` for Claude Code skills). */
  path: string
  /**
   * One-line summary shown to the skill selector: `description` (Claude Code),
   * falling back to `summary` (legacy) or the first descriptive body line.
   */
  overview: string
}

export type LoadedSkill = SkillSummary & {
  body: string
}

/** Mechanical checks a workflow step's output must pass (PRD §15). */
export type StepVerificationSpec = {
  requiredSections?: string[]
  requiredArtifacts?: string[]
  requireCitations?: boolean
  requireCheckpoint?: boolean
  /** Checklist phase that must be fully done/skipped. */
  requireChecklistComplete?: string
  allowValidationOverride?: boolean
}

export type IndexTargetLabels = {
  title?: string
  prompt?: string
  placeholder?: string
  reuseLabel?: string
  buildLabel?: string
}

export type FindingSchemaDefinition = {
  columns: ({ name: string; type?: string; enum?: string[] } | string)[]
}

export type StructureBoundaryRule = {
  kind: string
  pattern: string
  parent?: string
  /** Match pattern case-insensitively (legacy default is case-sensitive). */
  caseInsensitive?: boolean
  /** Require the whole normalized line to match, not just a prefix/substring. */
  titleOnly?: boolean
  /** CHAPTER-style rule: this match becomes the new parent segment (orderKey `${parent}-00`). */
  isParentBoundary?: boolean
  /** Regex group (1-based) carrying this boundary's own parent-scoped number
   * (word/roman/plain numeric); updates the current parent segment. */
  parentNumberGroup?: number
  /** Regex group (1-based) carrying an explicit child number (plain numeric);
   * falls back to auto-increment within the current parent when absent. */
  childNumberGroup?: number
  /** Regex group (1-based) carrying a raw string label used verbatim in the
   * orderKey instead of a counter (e.g. ANNEX "2-A-1" -> "A2A1"). */
  labelGroup?: number
  /** For labelGroup rules: whether the counter suffix is global across the
   * whole document (default) or resets per parent segment. */
  counterScope?: 'global' | 'parent'
  /** A regex (verb/prose alternation) tested against the text right after the
   * match; if it looks like body prose, the line is not treated as a boundary. */
  rejectRemainder?: string
  /** Fixed orderKey bypassing all counters (e.g. PREAMBLE is always "00-00"). */
  fixedOrderKey?: string
}

export type StructureProfileDefinition = {
  extends?: string
  boundaries?: StructureBoundaryRule[]
}

export type ChecklistDefinition = {
  phases?: { id: string; title?: string }[]
  collections?: Record<string, { prioritize?: string; max_items?: number }>
}

export type WorkflowStep = {
  id: string
  title: string
  description?: string
  depends_on?: string[]
  tool?: string
  prompt_template?: string
  model?: string
  requires_approval?: boolean
  /** Open applied output notes for this step. Defaults to true. */
  open_output?: boolean
  /** Vault path a mutating tool step writes its draft to. */
  output_path?: string
  /** Artifact key for this step's output; defaults to the step id. */
  output_artifact?: string
  /** Retry the step once via the LLM when verification fails mechanically. */
  self_correction?: boolean
  verification?: StepVerificationSpec
  /** Step-scoped large-document processing contract (parsed in M6). */
  batch?: BatchContract
  target_labels?: IndexTargetLabels
}

export type WorkflowDefinition = {
  id: string
  name: string
  description?: string
  steps: WorkflowStep[]
  /**
   * When true, treaty write tools (submit_wiki_finding, verify_wiki_links,
   * compile_wiki_report, build_treaty_wiki) bypass the per-write Diff approval
   * dialog and countdown for non-dangerous writes. Permission checks,
   * checkpoints, conflict detection, and explicit approval for dangerous
   * changes remain in force.
   */
  auto_apply?: boolean
  profiles?: Record<string, StructureProfileDefinition>
  schemas?: Record<string, FindingSchemaDefinition>
  checklist?: ChecklistDefinition
}

export type WorkflowLoadResult = {
  workflow: WorkflowDefinition
  path: string
  executionOrder: string[]
}

export type WorkflowLoadError = {
  path: string
  message: string
}

export type VerbexLexicalIndexStatus = {
  documentCount: number
  updatedAt: string | null
  indexPath: string
}

export type VerbexContextTraceItem = {
  sourceCitation?: import('../utils/sourceCitation').SourceCitation
  documentOcrCandidatePages?: number[]
  source:
    | 'mentioned'
    | 'current_note'
    | 'wiki'
    | 'bm25'
    | 'semantic'
    | 'wikilink'
    | 'backlink'
    | 'tag'
    | 'dataview'
    | 'base'
  path: string
  score: number | null
  heading: string | null
  snippet: string
  formatSource?: boolean
  included_in_context: boolean
  exclusionReason?: 'lexical_gate' | 'final_fit'
  truncatedForFit?: boolean
}

export type VerbexContextTrace = {
  query: string
  tokenBudget: number
  estimatedTokens: number
  items: VerbexContextTraceItem[]
  formatSourceExclusions?: string[]
}

export type VerbexEmbeddingIndexStatus = {
  indexPath: string
  /** Optional for legacy persisted/test snapshots; live stats always include it. */
  dimension?: number
  rowCount: number
  totalDataBytes: number
  contentBytes?: number
  embeddingBytes?: number
  metadataBytes?: number
  tableBytes?: number
  indexBytes?: number
  indexedFilesCount: number
  model: string
}

export type VerbexProviderStatus = {
  registryAvailable: boolean
  protocolVersion: number | null
  generation: string | null
  providers: {
    providerId: string
    providerVersion: string
    schemaVersion: string
    toolNames: string[]
  }[]
  toolNames: string[]
}

export type VerbexStatusSnapshot = {
  embeddingActivity?: import('../core/rag/embeddingIndexActivity').EmbeddingIndexActivity
  bootstrapped: boolean
  skills: SkillSummary[]
  workflows: WorkflowLoadResult[]
  workflowErrors: WorkflowLoadError[]
  activeRun: VerbexRunState | null
  pausedRuns: VerbexRunState[]
  lexicalIndex: VerbexLexicalIndexStatus | null
  embeddingIndex: VerbexEmbeddingIndexStatus | null
  providerStatus?: VerbexProviderStatus
  lastContext: VerbexContextTrace | null
  lastError: string | null
}

export type WorkflowStepRuntimeStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'

export type WorkflowRuntimeState = {
  workflowGoal: string
  turnIntent: string
  activeWorkflowId: string
  activeStepId: string
  stepStatus: WorkflowStepRuntimeStatus
  stepStatuses: Record<string, WorkflowStepRuntimeStatus>
  approvedAt?: string
}

export type WorkflowCoverageEntry = {
  path: string
  articleId: string
  startLine: number
  endLine: number
  status: 'pending' | 'reviewed'
  /** Revision-bound identity; optional for legacy run artifacts. */
  unitId?: string
  revisionHash?: string
}

export type AttachmentDigest = {
  path: string
  text: string
  chunkCount: number
  source: 'attachment' | 'current_note'
  sequentialVerification: boolean
  truncated: boolean
  /** Version 2 accounts for incomplete reduce and verification steps. */
  coverageProtocol?: 2
  /** Mechanical per-chunk provenance produced by map-reduce. */
  evidenceRecords?: import('../core/routing/evidenceRecords').EvidenceRecord[]
  evidenceSummary?: import('../core/routing/evidenceRecords').EvidenceCoverageSummary
  /** Set when the digest covers a binary document's disk projection. */
  projection?: import('../core/large-document/largeSourcePort').ProjectionCoverage
}
