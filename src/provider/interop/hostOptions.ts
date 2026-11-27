import type { App } from 'obsidian'

import type { OwnershipOptions } from '../ownershipTypes'

import type { BrowserRuntime } from './browserExecution'
import type { CommitPolicy } from './commitPolicy'
import type { CommitRuntime } from './commitPrepare'
import type { PluginInstance } from './discovery'
import type { OutputAnchorCapture } from './outputAnchorCapture'
import type { SessionApprovalHandler } from './sessionExecution'

export type BodyChoiceView = {
  option: string
  prefix: string | null
  paragraphs: number
  spacingPt: number | null
  preview: string
}

export type BodyChoiceRequest = {
  samplePath: string
  jobId: string
  choices: readonly BodyChoiceView[]
}

export type NativeHostOptions = {
  /** Asks the human which sample paragraph style is the body. Resolves to the chosen option id, or null when dismissed. */
  documentJobBodyChoice?: (
    request: BodyChoiceRequest,
    signal?: AbortSignal,
  ) => Promise<string | null>
  documentJobNotice?: (message: string) => void
  documentJobBaseFontPt?: () => number
  browserRuntime?: BrowserRuntime
  browserEffects?: () => boolean
  selfId?: string
  list?: (app: App) => PluginInstance[]
  describeTimeoutMs?: number
  /** readAsset() time limit; 1,000 ms when absent. */
  readAssetTimeoutMs?: number
  refreshBudgetMs?: number
  callTimeoutMs?: number
  resolveTimeoutMs?: number
  /** Validates a provider-reported Vault path; throws when not a user path. */
  vaultPath?: (path: string) => string
  /**
   * Exposes and runs `session` tools (edits of a provider's working copy).
   * Off until the Phase 2 entry gate of the co-editing plan has passed.
   */
  sessionEffects?: boolean
  approveSession?: SessionApprovalHandler
  /** Exposes and runs `commit` tools (provider writes of user files). Off by default. */
  commitEffects?: boolean
  commitPolicy?: () => CommitPolicy
  commitRuntime?: CommitRuntime
  outputAnchorCapture?: OutputAnchorCapture
  assertOwnership?: (
    path: string,
    providerId: string,
    options?: OwnershipOptions,
  ) => Promise<void>
}
