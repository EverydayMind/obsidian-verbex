import { App, normalizePath } from 'obsidian'

import type { SemanticSearchProvider } from '../../context/ContextBuilder'
import { ContextForestService } from '../../context/ContextForestService'
import type { LexicalIndexRepository } from '../../context/LexicalIndex'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import type { VerbexSettings } from '../../settings/schema/setting.types'
import { resolveLoadedSettings } from '../../settings/schema/settings'
import type { RequestTool } from '../../types/llm/request'
import type { ContextForestParams } from '../rag/contextForestTypes'

import type { ToolArgs, ToolResult } from './localToolCommon'
import type { ToolRegistryEntry } from './toolDefinitions'
import { tool } from './toolHelper'

export function getSearchContextTreeToolDefinition(
  _locale: ModelLocale = getModelLocale(),
): RequestTool {
  return tool(
    'search_context_tree',
    'Experimental: search the vault and build a query-conditioned context forest (up to 3 roots) from direct BM25/vector candidates expanded along explicit wikilink/backlink/frontmatter references (and optionally shared tags). Returns a bounded context map plus direct snippets. It is not an exhaustive vault search, map rows are not read evidence, and max_depth is a limit, not a guaranteed reach.',
    {
      query: {
        type: 'string',
        description:
          'Search query used to rank root candidates and weight multi-hop paths. May be empty when root_path is specified.',
      },
      root_path: {
        type: 'string',
        description:
          'Optional explicit root note path to anchor the context tree (score(root) = 1.0).',
      },
      folder: {
        type: 'string',
        description: 'Optional folder prefix to restrict the search scope.',
      },
      max_depth: {
        type: 'number',
        description:
          'Maximum hop depth from each root (0..4, default 3). Use 0 for direct candidates only.',
      },
      max_branch_per_node: {
        type: 'number',
        description:
          'Maximum child branches expanded per parent (1..8, default 4).',
      },
      max_nodes: {
        type: 'number',
        description:
          'Maximum total nodes in the forest including roots (1..25, default 16).',
      },
      include_tags: {
        type: 'boolean',
        description:
          'Whether to also consider shared-tag neighbors; they pass only with strong content similarity (default false).',
      },
      include_leaf_snippets: {
        type: 'boolean',
        description:
          'Whether to include bounded snippets for graph-only selected leaf nodes (default false).',
      },
      map_only: {
        type: 'boolean',
        description:
          'Return only the structural forest map without hydrating any note bodies (default false).',
      },
      exclude_daily_notes: {
        type: 'boolean',
        description:
          'Whether to exclude daily notes from search and graph expansion (default false).',
      },
      token_budget: {
        type: 'number',
        description:
          'Optional lower token budget; the host budget is the upper bound.',
      },
    },
    ['query'],
  )
}
export const SEARCH_CONTEXT_TREE_TOOL_DEFINITION =
  getSearchContextTreeToolDefinition()

export const SEARCH_CONTEXT_TREE_TOOL_REGISTRY_ENTRY: ToolRegistryEntry = {
  category: 'read',
  agentCallable: true,
  workflowCallable: false,
  evidenceRole: 'discovery',
}

export type ContextForestToolContext = {
  app: App
  getContextBudget: () => number
  getSemanticProvider?: () => Promise<SemanticSearchProvider | null>
  lexicalIndex?: LexicalIndexRepository | null
  getSettings?: () => VerbexSettings
  contextForestService?: ContextForestService
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const items = value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
  return items.length > 0 ? items : undefined
}

export async function executeSearchContextTreeTool(
  args: ToolArgs,
  ctx: ContextForestToolContext,
): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  const rawRootPath = asOptionalString(args.root_path)
  if (!query && !rawRootPath) {
    return {
      kind: 'error',
      message: L({
        ko: 'search_context_tree 실행에는 query 또는 root_path가 필요합니다.',
        en: 'search_context_tree requires query or root_path.',
      }),
    }
  }

  let resolvedRootPath: string | undefined
  if (rawRootPath) {
    const normalizedRoot = normalizePath(rawRootPath)
    assertUserVaultPath(ctx.app, normalizedRoot)
    const exactFile = ctx.app.vault.getFileByPath?.(normalizedRoot)
    if (exactFile) {
      resolvedRootPath = exactFile.path
    } else {
      const withMd = normalizedRoot.toLowerCase().endsWith('.md')
        ? normalizedRoot
        : `${normalizedRoot}.md`
      assertUserVaultPath(ctx.app, withMd)
      const mdFile = ctx.app.vault.getFileByPath?.(withMd)
      if (!mdFile) {
        return {
          kind: 'error',
          message: L({
            ko: `지정한 root_path 노트를 찾을 수 없습니다: ${rawRootPath}`,
            en: `Cannot find the specified root_path note: ${rawRootPath}`,
          }),
        }
      }
      resolvedRootPath = mdFile.path
    }
  }

  const rawFolder = asOptionalString(args.folder)
  if (rawFolder) {
    assertUserVaultPath(ctx.app, normalizePath(rawFolder))
  }

  const contextBudget = ctx.getContextBudget() || 12000
  const defaultTokenBudget = Math.min(
    4800,
    Math.max(800, Math.floor(contextBudget * 0.25)),
  )

  const forestParams: ContextForestParams = {
    query,
    rootPath: resolvedRootPath,
    maxDepth: asOptionalNumber(args.max_depth),
    maxBranchPerNode: asOptionalNumber(args.max_branch_per_node),
    maxNodes: asOptionalNumber(args.max_nodes),
    includeTags: asOptionalBoolean(args.include_tags),
    includeLeafSnippets: asOptionalBoolean(args.include_leaf_snippets),
    mapOnly: asOptionalBoolean(args.map_only),
    // §6: the host-granted budget is a cap; model args may only lower it.
    tokenBudget: Math.min(
      defaultTokenBudget,
      asOptionalNumber(args.token_budget) ?? defaultTokenBudget,
    ),
    scope: {
      folder: rawFolder ? normalizePath(rawFolder) : undefined,
      includePaths: asOptionalStringArray(args.include_paths),
      excludePaths: asOptionalStringArray(args.exclude_paths),
      excludeDailyNotes: asOptionalBoolean(args.exclude_daily_notes),
    },
  }

  const service =
    ctx.contextForestService ??
    new ContextForestService({
      app: ctx.app,
      getSettings: ctx.getSettings ?? (() => resolveLoadedSettings({})),
      lexicalIndex: ctx.lexicalIndex ?? null,
      getSemanticProvider: ctx.getSemanticProvider,
    })

  const { formatted } = await service.search(forestParams)
  return {
    kind: 'read',
    facts: {
      completeness: formatted.shownPaths.length ? 'complete' : 'empty',
      sample: { unit: 'notes', shown: formatted.shownPaths.length },
    },
    text: formatted.text,
  }
}
