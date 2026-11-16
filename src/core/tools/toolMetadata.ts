import { TOOL_REGISTRY } from './toolDefinitions'

export type ToolMetadata = {
  privateTranscript?: boolean
  /** Replay past external results as observations, never as mutation authority. */
  historicalResult?: 'external_observation'
  category: import('../../verbex/types').OperationCategory
  evictable?: boolean
  evictionKind?: string
  evidenceRole?: string
  pathArgs?: string[]
}
export type ToolMetadataSource = (name: string) => ToolMetadata | undefined
export function resolveToolMetadata(
  name: string,
  source?: ToolMetadataSource,
): ToolMetadata | undefined {
  return TOOL_REGISTRY[name] ?? source?.(name)
}
