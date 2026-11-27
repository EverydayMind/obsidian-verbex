import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import type { RequestTool } from '../../types/llm/request'

import {
  DOCUMENT_JOB_TOOL_REGISTRY,
  getDocumentJobToolDefinitions,
} from './documentJobTools'
import { FAMILY_TOOL_REGISTRY, getFamilyToolDefinitions } from './familyTools'
import { FILE_TOOL_REGISTRY, getFileToolDefinitions } from './fileTools'
import { INDEX_TOOL_REGISTRY, getIndexToolDefinitions } from './indexTools'
import {
  REPORT_STYLE_TOOL_REGISTRY,
  getReportStyleToolDefinitions,
} from './reportStyleTools'
import { SEARCH_TOOL_REGISTRY, getSearchToolDefinitions } from './searchTools'
import type { ToolRegistryEntry } from './toolRegistryEntry'
export type { ToolRegistryEntry } from './toolRegistryEntry'

const baseRegistry: Record<string, Omit<ToolRegistryEntry, 'definition'>> = {
  ...FILE_TOOL_REGISTRY,
  ...SEARCH_TOOL_REGISTRY,
  ...INDEX_TOOL_REGISTRY,
  ...REPORT_STYLE_TOOL_REGISTRY,
  ...DOCUMENT_JOB_TOOL_REGISTRY,
  ...FAMILY_TOOL_REGISTRY,
  llm: { category: 'read', agentCallable: false, workflowCallable: true },
  web_search: {
    category: 'external_api',
    agentCallable: false,
    workflowCallable: false,
  },
  external_api: {
    category: 'external_api',
    agentCallable: false,
    workflowCallable: false,
  },
}

export type ToolCatalog = {
  local: RequestTool[]
  registry: Record<string, ToolRegistryEntry>
  agent: RequestTool[]
  agentRead: RequestTool[]
}

const catalogs = new Map<ModelLocale, ToolCatalog>()

/** Build every derived view from the same language bundle. */
export function getToolCatalog(
  locale: ModelLocale = getModelLocale(),
): ToolCatalog {
  const cached = catalogs.get(locale)
  if (cached) return cached
  const local = [
    ...getFileToolDefinitions(locale),
    ...getSearchToolDefinitions(locale),
    ...getIndexToolDefinitions(locale),
    ...getReportStyleToolDefinitions(locale),
    ...getDocumentJobToolDefinitions(locale),
    ...getFamilyToolDefinitions(locale),
  ]
  const registry = Object.fromEntries(
    Object.entries(baseRegistry).map(([name, entry]) => [
      name,
      { ...entry, definition: local.find((t) => t.function.name === name) },
    ]),
  )
  const agent = local.filter((t) => registry[t.function.name]?.agentCallable)
  const agentRead = agent.filter(
    (t) => registry[t.function.name]?.category === 'read',
  )
  const catalog = { local, registry, agent, agentRead }
  catalogs.set(locale, catalog)
  return catalog
}

/** Compatibility views for consumers that only need immutable metadata. */
export const LOCAL_TOOL_DEFINITIONS = getToolCatalog().local
export const TOOL_REGISTRY = getToolCatalog().registry

export const CANONICAL_TOOL_MAP: Record<string, string> = {
  build_treaty_wiki: 'build_review_index',
  submit_wiki_finding: 'submit_finding',
  verify_wiki_links: 'audit_index',
  compile_wiki_report: 'compile_report',
}

export function canonicalToolName(name: string): string {
  return CANONICAL_TOOL_MAP[name] ?? name
}

export const AGENT_READ_TOOL_NAMES = new Set(
  Object.entries(TOOL_REGISTRY)
    .filter(([_, entry]) => entry.agentCallable && entry.category === 'read')
    .map(([name]) => name),
)

export const AGENT_READ_TOOL_DEFINITIONS = getToolCatalog().agentRead

export const AGENT_WRITE_TOOL_NAMES = new Set([
  ...Object.entries(TOOL_REGISTRY)
    .filter(
      ([_, entry]) =>
        entry.agentCallable &&
        ['write', 'move', 'delete'].includes(entry.category),
    )
    .map(([name]) => name),
  ...Object.keys(CANONICAL_TOOL_MAP), // include legacy aliases
])

export const SELF_CONTAINED_SOURCE_TOOL_NAMES = new Set([
  ...Object.entries(TOOL_REGISTRY)
    .filter(([_, entry]) => entry.selfContainedSource)
    .map(([name]) => name),
  'build_treaty_wiki', // include legacy alias
])

export const AGENT_CALLABLE_TOOL_NAMES = new Set([
  ...AGENT_READ_TOOL_NAMES,
  ...AGENT_WRITE_TOOL_NAMES,
])
