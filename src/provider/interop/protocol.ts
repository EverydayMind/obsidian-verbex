import type { RequestTool } from '../../types/llm/request'

/** v1 remains compatible; v2 adds the browser profile in contracts/agentinterop/v2. */
export const AGENT_CAPABILITY_PROVIDER = Symbol.for(
  'dev.agentinterop.capability-provider',
)
export const AGENTINTEROP_PROTOCOL = 'agentinterop'
export const AGENTINTEROP_PROTOCOL_VERSION = 1
export const PROVIDERS_CHANGED_EVENT = 'agentinterop:providers-changed'

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }
export type JsonObject = Record<string, JsonValue>

export const TOOL_EFFECTS = [
  'read',
  'pure',
  'session',
  'commit',
  'browser',
] as const
export type ToolEffect = (typeof TOOL_EFFECTS)[number]

export const META_EFFECT = 'dev.agentinterop/effect'
export const META_GROUP = 'dev.agentinterop/group'
export const META_RESOURCE_TYPES = 'dev.agentinterop/resourceTypes'
export const META_KEYWORDS = 'dev.agentinterop/keywords'
export const META_MAX_RESULT_CHARS = 'dev.agentinterop/maxResultChars'
export const META_CODE_BLOCK_LANGUAGES = 'dev.agentinterop/codeBlockLanguages'
export const META_RESOURCE = 'dev.agentinterop/resource'
export const META_ERROR = 'dev.agentinterop/error'
export const META_EVIDENCE_PATHS = 'dev.agentinterop/evidencePaths'

export type ToolDescriptor = {
  name: string
  title?: string
  description: string
  inputSchema: JsonObject
  resourceKind?: 'browser'
  browserAction?: 'tab' | 'navigate' | 'interact' | 'console' | 'script'
  effect: ToolEffect
  group?: string
  resourceTypes: readonly string[]
  /**
   * Fenced code block languages the tool works on (host-capabilities-v1).
   * parseDescriptor always sets it; absent means none.
   */
  codeBlockLanguages?: readonly string[]
  keywords: readonly string[]
  maxResultChars?: number
}

export type ProviderDescriptor = {
  provider: { id: string; name: string; version: string; description?: string }
  instructions?: string
  tools: readonly ToolDescriptor[]
}

export type Caller = {
  pluginId: string
  conversationId: string
  runId: string
  turnId: string
}

/** What the editor showed when the user submitted the turn. Provider data. */
export type TurnScope = {
  providerId: string
  path: string
  sessionId: string
  incarnation: string
  documentEpoch: string
  revision: number
  contextId: string
  capturedAt: string
  /** The exact range stays with the provider; the host never computes offsets. */
  selection?: { selectionId: string; handles: string[]; text: string }
}

export type TargetContext = {
  caller: Caller
  requestId: string
  signal: AbortSignal
}

export type InvocationContext = TargetContext & {
  acceptsImages?: boolean
  providerIdentity?: { descriptorDigest: string; generation: number }
  actor: { kind: 'agent'; label: string }
  scope?: TurnScope
  /** Session calls: the target the host pinned, the observations the model saw, the grant (informational). */
  target?: unknown
  observations?: string[]
  grant?: { kind: 'document'; path: string }
}

export type ProviderCallTool = (
  name: string,
  args: JsonObject,
  ctx: InvocationContext,
) => unknown

export { nativeProviderSettingsSchema } from './providerSettingsSchema'
export type {
  NativeProviderApproval,
  CommitGrant,
} from './providerSettingsSchema'

export const NATIVE_TOOL_PREFIX = 'plg__'
export function nativeToolName(providerId: string, tool: string): string {
  return `${NATIVE_TOOL_PREFIX}${providerId}__${tool}`
}
export function nativeToolDefinition(
  name: string,
  tool: ToolDescriptor,
): RequestTool {
  return {
    type: 'function',
    function: {
      name,
      description: tool.description,
      parameters: tool.inputSchema as RequestTool['function']['parameters'],
    },
  }
}
