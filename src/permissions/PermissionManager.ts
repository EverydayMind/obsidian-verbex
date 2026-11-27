import { TOOL_REGISTRY } from '../core/tools/toolDefinitions'
import {
  ToolMetadataSource,
  resolveToolMetadata,
} from '../core/tools/toolMetadata'
import { VerbexSettings } from '../settings/schema/setting.types'
import { DiffBlock, createDiffBlocks } from '../utils/chat/diff'
import { OperationCategory, ProposedChange } from '../verbex/types'
import { validateBinaryDependencies } from '../workflow/binaryDependencies'

import { countLostLines } from './lostLines'

export type { OperationCategory } from '../verbex/types'

/**
 * Permission gate for Local Tool execution (PRD §12).
 *
 * Every mutating tool call is classified into an operation category and run
 * through the configured permission level to decide whether it can be applied
 * silently, needs a Diff + explicit approval, can be auto-applied under Auto
 * Mode, or must be denied outright.
 *
 * Two invariants hold regardless of configuration:
 *  - read-only operations never require approval;
 *  - "dangerous" operations (delete / move / external API by default) are
 *    ALWAYS explicitly approved and never auto-applied, even in Auto Mode.
 */

export type PermissionLevel =
  | 'read_only'
  | 'diff_only'
  | 'approve_write'
  | 'auto'
  | 'session_trust'
  | 'forbidden'

export type PermissionAction =
  | 'allow' // proceed without a Diff (read ops, trusted writes)
  | 'require_approval' // show Diff, wait for explicit user approval
  | 'auto_apply' // Auto Mode: apply after a cancellable countdown
  | 'deny' // not permitted under the current level

export type PermissionDecision = {
  action: PermissionAction
  category: OperationCategory
  dangerous: boolean
  /** Whether a checkpoint must be written before applying (mutating ops). */
  requiresCheckpoint: boolean
  reason: string
  lostLines?: { count: number; capped: boolean }
  /** Registry-marked tools: every change needs review; no setting skips it. */
  alwaysExplicit?: boolean
}

type PermissionSettings = VerbexSettings['verbex']['permissions']

const TOOL_CATEGORY: Record<string, OperationCategory> = Object.fromEntries(
  Object.entries(TOOL_REGISTRY).map(([name, entry]) => [name, entry.category]),
)

export function categorizeTool(
  toolName: string,
  source?: ToolMetadataSource,
): OperationCategory {
  return (
    TOOL_CATEGORY[toolName] ??
    resolveToolMetadata(toolName, source)?.category ??
    'write'
  )
}

/**
 * A write that empties or all-but-empties an existing, non-trivial file is a
 * delete in disguise (`write_file`/`update_file` with `""` or a near-empty
 * body). Detecting it lets the gate treat such a write with the same caution as
 * an explicit `delete`, so it can't slip through Auto Mode or a trusted-write
 * level on the strength of its tool name alone.
 */
const DESTRUCTIVE_SHRINK_MIN_BEFORE = 50
const DESTRUCTIVE_SHRINK_RATIO = 0.1

export function isDestructiveWrite(change: ProposedChange): boolean {
  if (change.op !== 'modify') return false
  const before = change.before
  if (before === null) return false
  const afterLen = (change.after ?? '').trim().length
  // An empty result is always destructive, regardless of the original file
  // size. Without this guard, writing "" to a file shorter than
  // DESTRUCTIVE_SHRINK_MIN_BEFORE chars silently bypasses the check.
  if (afterLen === 0) return true
  const beforeLen = before.trim().length
  if (beforeLen < DESTRUCTIVE_SHRINK_MIN_BEFORE) return false
  return afterLen <= beforeLen * DESTRUCTIVE_SHRINK_RATIO
}

export function escalateLostLines(
  change: ProposedChange,
  decision: PermissionDecision,
  blocks: DiffBlock[],
): PermissionDecision {
  if (
    decision.category !== 'write' ||
    (decision.action !== 'allow' && decision.action !== 'auto_apply') ||
    change.op !== 'modify' ||
    change.before === null
  )
    return decision
  const { lost, capped } = countLostLines(
    change.before,
    change.after ?? '',
    blocks,
  )
  if (!lost && !capped) return decision
  return {
    ...decision,
    action: 'require_approval',
    dangerous: true,
    reason: 'This write removes existing lines and requires explicit approval.',
    lostLines: { count: lost, capped },
  }
}

export class PermissionManager {
  private autoMode: boolean
  // Categories the user has trusted for the remainder of the session.
  private readonly sessionTrust = new Set<OperationCategory>()

  constructor(
    private permissions: PermissionSettings,
    private pathPolicy?: (path: string) => void,
    private toolMetadata?: ToolMetadataSource,
  ) {
    this.autoMode = permissions.autoModeDefault
  }

  setPermissions(permissions: PermissionSettings): void {
    this.permissions = permissions
  }

  setAutoMode(on: boolean): void {
    this.autoMode = on
  }

  isAutoMode(): boolean {
    return this.autoMode
  }

  autoModeStatus(): string {
    return this.autoMode
      ? `Auto Mode ON (countdown ${this.permissions.autoModeTimeoutSeconds}s, excluding ${this.permissions.autoModeExclude.join('/')})`
      : 'Auto Mode OFF'
  }

  /** Record that the user approved a category for the rest of the session. */
  trustForSession(category: OperationCategory): void {
    this.sessionTrust.add(category)
  }

  clearSessionTrust(): void {
    this.sessionTrust.clear()
  }

  isDangerous(category: OperationCategory): boolean {
    return this.permissions.autoModeExclude.includes(category)
  }

  /**
   * Like {@link decide}, but inspects the change's content so a write that
   * effectively deletes an existing file (empties or drastically shrinks it) is
   * escalated to an explicit approval and excluded from silent/auto application
   * — closing the "destructive write instead of delete_file" bypass.
   */
  decideForChange(
    change: ProposedChange,
    blocks?: DiffBlock[],
  ): PermissionDecision {
    try {
      validateBinaryDependencies(change)
      for (const path of [
        change.path,
        change.originalPath,
        ...(change.sourceDependencies ?? []).map(
          (dependency) => dependency.path,
        ),
        ...(change.binarySourceDependencies ?? []).map(
          (dependency) => dependency.path,
        ),
        ...(change.composite?.entries ?? []).flatMap((entry) => [
          entry.path,
          entry.originalPath,
        ]),
      ])
        if (path) this.pathPolicy?.(path)
    } catch (error) {
      return {
        action: 'deny',
        category: categorizeTool(change.tool, this.toolMetadata),
        dangerous: true,
        requiresCheckpoint: false,
        reason: error instanceof Error ? error.message : 'Vault path denied.',
      }
    }
    const decision = this.decide(change.tool)
    if (
      decision.category === 'write' &&
      (decision.action === 'allow' || decision.action === 'auto_apply') &&
      isDestructiveWrite(change)
    ) {
      return {
        ...decision,
        action: 'require_approval',
        dangerous: true,
        reason:
          'This write empties or drastically shrinks an existing file (an implicit delete) and requires explicit approval.',
      }
    }
    return escalateLostLines(
      change,
      decision,
      blocks ??
        (change.op === 'modify' &&
        change.before !== null &&
        decision.category === 'write' &&
        (decision.action === 'allow' || decision.action === 'auto_apply')
          ? createDiffBlocks(change.before, change.after ?? '')
          : []),
    )
  }

  decide(toolName: string): PermissionDecision {
    const category = categorizeTool(toolName, this.toolMetadata)

    if (category === 'read') {
      return {
        action: 'allow',
        category,
        dangerous: false,
        requiresCheckpoint: false,
        reason: 'Read-only operation.',
      }
    }

    if (category === 'external_api' && !this.permissions.allowExternalApi) {
      return {
        action: 'deny',
        category,
        dangerous: true,
        requiresCheckpoint: false,
        reason: 'External API access is disabled in settings.',
      }
    }

    const dangerous = this.isDangerous(category)
    const requiresCheckpoint =
      category !== 'external_api' && this.permissions.checkpointBeforeWrite

    const level = this.permissions.defaultPermission

    if (level === 'forbidden' || level === 'read_only') {
      return {
        action: 'deny',
        category,
        dangerous,
        requiresCheckpoint: false,
        reason: `Permission level "${level}" does not allow ${category} operations.`,
      }
    }

    // Dangerous operations are always explicitly approved, regardless of level
    // or Auto Mode (PRD §12).
    if (dangerous) {
      return {
        action: 'require_approval',
        category,
        dangerous,
        requiresCheckpoint,
        reason: `${category} is a high-risk operation and always requires explicit approval.`,
        ...(TOOL_REGISTRY[toolName]?.alwaysExplicitApproval
          ? { alwaysExplicit: true }
          : {}),
      }
    }

    // Note tidy tools ask for every change, even under Auto Mode or trust.
    if (TOOL_REGISTRY[toolName]?.alwaysExplicitApproval) {
      return {
        action: 'require_approval',
        category,
        dangerous,
        requiresCheckpoint,
        reason:
          TOOL_REGISTRY[toolName]?.explicitApprovalReason ??
          'This note tidy change always requires explicit approval.',
        alwaysExplicit: true,
      }
    }

    // Session Auto Mode is an explicit runtime override (verbex:auto-toggle /
    // /auto on). It must work even when the saved default is conservative
    // diff_only + alwaysRequireApproval.
    if (this.autoMode) {
      return {
        action: 'auto_apply',
        category,
        dangerous,
        requiresCheckpoint,
        reason: 'Auto Mode: applies after a cancellable countdown.',
      }
    }

    // alwaysRequireApproval forces review for normal writes when Auto Mode is
    // not active.
    if (this.permissions.alwaysRequireApproval) {
      // ...except a non-dangerous op the user trusted this session.
      if (this.sessionTrust.has(category)) {
        return {
          action: 'allow',
          category,
          dangerous,
          requiresCheckpoint,
          reason: 'Trusted for this session.',
        }
      }
      return {
        action: 'require_approval',
        category,
        dangerous,
        requiresCheckpoint,
        reason: 'Explicit approval required before writing.',
      }
    }

    if (level === 'session_trust' && this.sessionTrust.has(category)) {
      return {
        action: 'allow',
        category,
        dangerous,
        requiresCheckpoint,
        reason: 'Trusted for this session.',
      }
    }

    // diff_only / approve_write / auto (mode off) / session_trust (untrusted):
    // show the Diff and wait for approval.
    return {
      action: 'require_approval',
      category,
      dangerous,
      requiresCheckpoint,
      reason: 'Diff review required before applying.',
    }
  }
}
