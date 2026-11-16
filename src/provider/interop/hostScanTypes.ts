import type { RequestTool } from '../../types/llm/request'

import type { ProviderHandle } from './discovery'
import type { ProviderDescriptor, ToolDescriptor } from './protocol'

export type NativeProviderState =
  | 'pending'
  | 'active'
  | 'reapproval'
  | 'disabled'
  | 'error'

export type NativeProviderStatus = {
  providerId: string
  pluginVersion: string
  protocolVersion?: number
  state: NativeProviderState
  message: string
  digest?: string
  descriptor?: ProviderDescriptor
  descriptorJson?: string
  runtimeFault?: boolean
  currentProviderCause?: import('./currentProvider').ProviderCurrentCause
  artifactSha256?: string
  descriptorDiff?: {
    changes: { path: string; before: string; after: string }[]
    truncated: boolean
  }
}

export type NativeToolEntry = {
  name: string
  providerId: string
  tool: ToolDescriptor
  definition: RequestTool
  policyRevision?: number
  identity: string
}

export type Discovered = {
  handle: ProviderHandle
  descriptor: ProviderDescriptor
  descriptorJson?: string
  digest: string
  generation: number
}

export type ScanResult = {
  discovered: Map<string, Discovered>
  entries: Map<string, NativeToolEntry>
  statuses: NativeProviderStatus[]
}
