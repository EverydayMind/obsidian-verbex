export const VERBEX_PROVIDER_HOST_PROTOCOL_VERSION = 1 as const
/** Public UI bridge used by companion plugins to submit a normal chat turn. */
export const VERBEX_CHAT_HOST_PROTOCOL_VERSION = 1 as const
export const KORDOC_PROVIDER_ID = 'kordoc-transform' as const
/** HWPX Exporter plugin id (was `hwpx-exporter` before 0.9.5). */
export const HWPX_EXPORTER_PROVIDER_ID = 'md-to-hwpx' as const
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

export type VerbexChatApi = {
  protocolVersion: typeof VERBEX_CHAT_HOST_PROTOCOL_VERSION
  sendMessage(message: string): Promise<boolean>
  sendMessageV2?(
    message: string,
    options?: VerbexChatSubmissionOptions,
  ): Promise<ChatSubmissionResult>
}

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
