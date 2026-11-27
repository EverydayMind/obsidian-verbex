import type { HwpEditScope } from './contract'

/**
 * Immutable per-turn view of the tools the host can route to. Produced by
 * `ToolProviderHub` for the native, MCP and connector paths; it grants no
 * execution authority by itself.
 */
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
  /** Tools the input budget left out of this turn (B4); never re-exposed. */
  budgetDemoted?: readonly string[]
  snapshotId: string
  generation: string
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
