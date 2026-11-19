import { App, TFile, normalizePath } from 'obsidian'

export { DEFAULT_TOOL_REQUEST_LOG } from '../../constants'

import { SemanticSearchProvider } from '../../context/ContextBuilder'
import { noteFormat, noteFormatLocale } from '../../i18n/noteFormats'
import { categorizeTool } from '../../permissions/PermissionManager'
import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import {
  assertUserVaultPath,
  isAllowedHiddenConfigPath,
} from '../../security/vaultPathPolicy'
import type { ConfigFolders } from '../../security/vaultPathPolicy'
import { ProposedChange } from '../../verbex/types'

export type ToolResult =
  | {
      kind: 'read'
      facts?: import('./readFacts').ReadFacts
      text: string
      connectorAudit?: import('../../provider/connectors/PluginConnectorHost').ConnectorAudit
      evidencePaths?: string[]
      disclosure?: import('../../types/llm/request').ConnectorDisclosure
    }
  | { kind: 'change'; change: ProposedChange }
  | { kind: 'outcome'; outcome: import('../llm/toolOutcome').AgentToolOutcome }
  | { kind: 'error'; message: string; retryAllowed?: boolean }

export type ToolArgs = Record<string, unknown>

export type SemanticAvailability =
  | 'lexical_only'
  | 'not_started'
  | 'initializing'
  | 'model_unset'
  | 'index_not_ready'
  | 'cooling_down'
  | 'ready'
export type SemanticFact =
  | Exclude<SemanticAvailability, 'lexical_only' | 'ready'>
  | 'embedding_failed'
  | 'deadline'
  | 'no_vector_hits'
  | 'vector_not_selected'
export {
  semanticFactText,
  isBasePath,
  renderOfferHint,
} from './localToolCommonText'

export function semanticAvailabilityFact(
  ctx: ToolExecutionContext,
): SemanticFact | undefined {
  if (ctx.semanticRequested?.() === false) return undefined
  const status = ctx.semanticAvailability?.()
  if (status === 'not_started') ctx.requestSemanticPreparation?.()
  return status && status !== 'ready' && status !== 'lexical_only'
    ? status
    : undefined
}

export type ReaderProvider = {
  providerId: string
  state: string
  readTools: readonly { name: string; resourceTypes: readonly string[] }[]
}

export type ToolExecutionContext = {
  app: App
  configFolders?: ConfigFolders
  getContextBudget: () => number
  getSemanticProvider?: () => Promise<SemanticSearchProvider | null>
  semanticAvailability?: () => SemanticAvailability
  requestSemanticPreparation?: () => void
  semanticRequested?: () => boolean
  getToolRequestLogPath: () => string
  getPriorityFolder: () => string
  exposedToolNames?: readonly string[]
  readerProviders?: readonly ReaderProvider[]
  /** Plugins awaiting (re)approval: manifest name, id and state only. */
  pendingApprovals?: () => readonly import('../../provider/interop/pendingPluginApprovals').PendingPluginApproval[]
  signal?: AbortSignal
  /** The chat run id (`chat-<conversationId>`) on both agent call paths. */
  conversationId?: string
  propertyQuerySessions?: import('./propertyQuerySession').PropertyQuerySessionStore
}

export type SemanticCallbacks = Pick<
  ToolExecutionContext,
  'semanticAvailability' | 'requestSemanticPreparation' | 'semanticRequested'
>

export const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/
export const READABLE_TEXT_EXTENSIONS = 'md base csv tsv txt canvas'.split(' ')
export {
  DATAVIEW_BLOCK_RE,
  BASE_BLOCK_RE,
  BASE_FILE_EMBED_RE,
} from './localToolCommonText'

export type ToolRequestInput = {
  name: string
  purpose: string
  whyInsufficient?: string | null
  example?: string | null
  inputs?: string | null
  outputs?: string | null
  at?: Date
}

function djb2(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

export function toolRequestKey(name: string, purpose: string): string {
  return `${name}::${djb2(purpose.trim())}`
}

export function formatToolRequestEntry(
  input: ToolRequestInput,
  existing = '',
): string {
  const locale = noteFormatLocale(existing)
  const field = (key: Parameters<typeof noteFormat>[0], value: string) =>
    `- **${noteFormat(key, locale)}**: ${value}`
  const at = (input.at ?? new Date()).toISOString()
  const lines = [
    `## ${input.name} — ${at}`,
    `<!-- verbex-tool-request: ${toolRequestKey(input.name, input.purpose)} -->`,
    field('purpose', input.purpose),
  ]
  if (input.whyInsufficient) {
    lines.push(field('insufficient', input.whyInsufficient))
  }
  if (input.inputs) lines.push(field('inputs', input.inputs))
  if (input.outputs) lines.push(field('outputs', input.outputs))
  if (input.example) lines.push(field('example', input.example))
  lines.push(field('status', noteFormat('pending', locale)))
  return lines.join('\n')
}

export function str(args: ToolArgs, key: string): string | null {
  const value = args[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function dangerousFor(tool: string): boolean {
  const category = categorizeTool(tool)
  return category === 'delete' || category === 'move'
}

export function changeHelper(
  tool: string,
  fields: Omit<ProposedChange, 'id' | 'dangerous' | 'tool'>,
): ToolResult {
  return {
    kind: 'change',
    change: {
      id: `${tool}:${fields.path}`,
      dangerous: dangerousFor(tool),
      tool,
      ...fields,
    },
  }
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
const MARKDOWN_LINK_RE = /!?\[[^\]]*]\(([^)]+)\)/g

export function extractLinks(content: string, unique = true): string[] {
  const links: string[] = []
  for (const match of content.matchAll(WIKILINK_RE)) {
    links.push(match[1].trim())
  }
  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    const target = match[1].trim()
    if (!/^https?:\/\//.test(target)) links.push(target)
  }
  return unique ? [...new Set(links)] : links
}

export function resolveFile(
  path: string,
  ctx: ToolExecutionContext,
  allowedExtensions: string[] = ['md', 'base'],
): TFile | null {
  if (!path) return null
  const normalized = normalizePath(path)

  const check = (file: TFile | null): TFile | null => {
    if (!file) return null
    if (
      allowedExtensions.length > 0 &&
      !allowedExtensions.includes(file.extension)
    ) {
      return null
    }
    return file
  }

  const getFile = (p: string): TFile | null => {
    if (ctx.app.vault.getFileByPath) {
      return ctx.app.vault.getFileByPath(p)
    }
    return ctx.app.vault.getMarkdownFiles().find((f) => f.path === p) ?? null
  }

  // 1. Direct match
  let file = check(getFile(normalized))
  if (file) return file

  // 2. Relative to priority (wiki) folder
  const priorityFolder = ctx.getPriorityFolder().trim()
  if (priorityFolder) {
    const relativePath = normalizePath(`${priorityFolder}/${path}`)
    file = check(getFile(relativePath))
    if (file) return file
  }

  // 3. Resolve link destination
  const resolved = ctx.app.metadataCache.getFirstLinkpathDest
    ? ctx.app.metadataCache.getFirstLinkpathDest(path, '')
    : null
  file = check(resolved)
  if (file) return file

  return null
}

export async function readToolText(
  path: string,
  ctx: ToolExecutionContext,
  extensions: string[] = READABLE_TEXT_EXTENSIONS,
): Promise<string | null> {
  let normalized: string
  try {
    normalized = assertUserVaultPath(ctx.app, normalizePath(path))
  } catch {
    return null
  }
  if (
    normalized.toLowerCase().startsWith('.verbex/') &&
    (!ctx.configFolders ||
      !isAllowedHiddenConfigPath(ctx.app, normalized, ctx.configFolders))
  )
    return null
  const file = resolveFile(normalized, ctx, extensions)
  if (file) {
    assertNotAiPrivate(file.path)
    const resolved = file.path.toLowerCase()
    if (
      (resolved === '.verbex' || resolved.startsWith('.verbex/')) &&
      (!ctx.configFolders ||
        !isAllowedHiddenConfigPath(ctx.app, file.path, ctx.configFolders))
    )
      return null
    return ctx.app.vault.cachedRead(file)
  }
  if (
    !ctx.configFolders ||
    !isAllowedHiddenConfigPath(ctx.app, normalized, ctx.configFolders)
  )
    return null
  if (!extensions.includes(normalized.split('.').pop()?.toLowerCase() ?? ''))
    return null
  return (await ctx.app.vault.adapter.exists(normalized))
    ? ctx.app.vault.adapter.read(normalized)
    : null
}

export function assertLocalToolPaths(
  app: App,
  tool: string,
  args: ToolArgs,
  folders?: ConfigFolders,
): void {
  if (
    [
      'write_file',
      'update_file',
      'replace_in_file',
      'patch_section',
      'update_frontmatter',
      'extract_to_file',
      'copy_file',
      'combine_files',
      'rename_file',
      'move_file',
      'delete_file',
    ].includes(tool)
  ) {
    for (const key of ['path', 'new_path', 'originalPath', 'output_path']) {
      if (typeof args[key] === 'string') {
        const path = assertUserVaultPath(app, args[key])
        if (
          (path.toLowerCase() === '.verbex' ||
            path.toLowerCase().startsWith('.verbex/')) &&
          (!folders || !isAllowedHiddenConfigPath(app, path, folders))
        )
          throw new Error('Internal configuration path denied.')
      }
    }
  }
}

export const FILE_LOCAL_TOOL_NAMES = [
  'read_file',
  'read_files',
  'render_base',
  'render_dataview',
  'list_files',
  'read_folder',
  'read_frontmatter',
  'active_note',
  'update_frontmatter',
  'find_by_property',
  'parse_links',
  'write_file',
  'update_file',
  'replace_in_file',
  'patch_section',
  'copy_file',
  'combine_files',
  'rename_file',
  'move_file',
  'delete_file',
]
