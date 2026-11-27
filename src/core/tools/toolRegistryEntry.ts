import type { RequestTool } from '../../types/llm/request'

import type { ToolMetadata } from './toolMetadata'

export type ToolRegistryEntry = Pick<ToolMetadata, 'category' | 'pathArgs'> & {
  definition?: RequestTool
  agentCallable: boolean
  workflowCallable: boolean
  selfContainedSource?: boolean
  artifactBinding?: { argument: string; mode: 'hard' | 'soft' }
  confirmTarget?: boolean
  evidenceRole?: 'discovery' | 'reading'
  evictionKind?: 'file_body' | 'search_result' | 'directive'
  evictable?: boolean
  simpleCore?: boolean
  executor?: 'review-index'
  executorArgument?: string
  /** Every change needs explicit review; Auto Mode and trust never skip it. */
  alwaysExplicitApproval?: boolean
  /**
   * The permission reason for `alwaysExplicitApproval` (a key of the Diff
   * view's reason map); the note tidy reason when absent.
   */
  explicitApprovalReason?: string
  /** Runs through Obsidian's Note Composer core plugin (DECISIONS §22). */
  requiresNoteComposer?: boolean
}
