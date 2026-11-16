import type { ToolRegistryEntry } from './toolCatalogRegistry'

export const DOCUMENT_JOB_TOOL_REGISTRY: Record<
  string,
  Omit<ToolRegistryEntry, 'definition'>
> = {
  save_format_decomposition: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  prepare_format_reuse: {
    category: 'read',
    pathArgs: ['sample_path'],
    agentCallable: true,
    workflowCallable: false,
  },
  produce_format_reuse: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
}
