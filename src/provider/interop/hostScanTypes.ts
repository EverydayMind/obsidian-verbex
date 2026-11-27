import type { RequestTool } from '../../types/llm/request'

import type { ProviderHandle } from './discovery'
import type {
  ExtractTextFacts,
  HostMembers,
} from './hostCapabilities/providerAssets'
import type { AssetsDescriptorValue } from './hostCapabilities/skillAssets'
import type { UnavailableTool } from './hostCapabilities/toolAvailability'
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
  /** Approved-snapshot parts, shown when the user reviews the provider. */
  assets?: AssetsDescriptorValue
  extractTextExtensions?: readonly string[]
  runtimeFault?: boolean
  /** Live hide-only list from the provider (people-only reasons); not approval data. */
  unavailableTools?: UnavailableTool[]
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
  /** The approval snapshot JSON (the descriptor alone without new members). */
  descriptorJson?: string
  digest: string
  generation: number
  assets?: AssetsDescriptorValue
  extractText?: ExtractTextFacts
  hostMembers?: HostMembers
}

export type ScanResult = {
  discovered: Map<string, Discovered>
  entries: Map<string, NativeToolEntry>
  statuses: NativeProviderStatus[]
}
