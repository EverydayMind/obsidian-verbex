import type { App } from 'obsidian'

import type { DiagnosticSpan } from './diagnostics'

export type ProviderCallOptions = {
  trace?: DiagnosticSpan
  app: App
  busy: Set<string>
  providerId: string
  signal?: AbortSignal
  timeoutMs: number
  invoke: (signal: AbortSignal) => unknown
  onVaultEvent?: (event: string, path: string, oldPath?: string) => void
}
