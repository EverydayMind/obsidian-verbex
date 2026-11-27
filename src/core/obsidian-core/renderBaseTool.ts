import { normalizePath, parseYaml } from 'obsidian'

import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'
import {
  UnsupportedBaseError,
  renderBaseDefinition,
} from '../../utils/basesQuery'
import * as fileText from '../tools/fileLocalToolsText'
import {
  READABLE_TEXT_EXTENSIONS,
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  isBasePath,
  readToolText,
  resolveFile,
  str,
} from '../tools/localToolCommon'

import { formatEvaluatedViewsMarkdown } from './basesEngineResult'
import { validateBaseDefinition } from './baseValidation'
import * as text from './renderBaseText'

type BaseEmbed = {
  label: string
  definition: string
  sourcePath: string
  view?: string
  thisContextUsed?: string
  thisIsBaseItself?: boolean
  error?: string
}

const THIS_REF_RE = /\bthis\./

function listViewNames(definition: string): string[] {
  try {
    const parsed = parseYaml(definition) as { views?: unknown } | null
    if (!parsed || !Array.isArray(parsed.views)) return []
    return parsed.views
      .map((item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as { name?: unknown }).name === 'string'
          ? (item as { name: string }).name
          : '',
      )
      .filter((name) => name.length > 0)
  } catch {
    return []
  }
}

async function resolveBaseEmbedPath(
  linkPath: string,
  sourcePath: string,
  ctx: ToolExecutionContext,
): Promise<string | null> {
  let decoded = linkPath
  try {
    decoded = decodeURIComponent(linkPath)
  } catch {
    // Keep literal link on malformed percent escapes.
  }
  const normalized = normalizePath(decoded.replace(/^\//, ''))
  if (await ctx.app.vault.adapter.exists(normalized)) return normalized

  const slash = sourcePath.lastIndexOf('/')
  if (slash >= 0) {
    const relative = normalizePath(
      `${sourcePath.slice(0, slash)}/${normalized}`,
    )
    if (await ctx.app.vault.adapter.exists(relative)) return relative
  }

  const resolved = ctx.app.metadataCache.getFirstLinkpathDest?.(
    decoded,
    sourcePath,
  )
  return resolved?.extension === 'base' ? resolved.path : null
}

async function collectBaseEmbeds(
  markdown: string,
  hostPath: string,
  ctx: ToolExecutionContext,
): Promise<BaseEmbed[]> {
  const found: (BaseEmbed & { offset: number })[] = []
  const blockRe =
    /(^|\n)[ \t]*(`{3,})[ \t]*base\b[^\n]*\n([\s\S]*?)\n[ \t]*\2(?=\n|$)/gi
  let blockMatch: RegExpExecArray | null
  let blockIndex = 0
  while ((blockMatch = blockRe.exec(markdown)) !== null) {
    blockIndex += 1
    const definition = blockMatch[3]
    found.push({
      label: `${hostPath} (inline base block ${blockIndex})`,
      definition,
      sourcePath: hostPath,
      thisContextUsed: THIS_REF_RE.test(definition) ? hostPath : undefined,
      offset: blockMatch.index,
    })
  }

  const embedRe = /!\[\[[^\]|]+?\.base(?:#([^\]|]+))?(?:\|[^\]]*)?\]\]/gi
  let embedMatch: RegExpExecArray | null
  while ((embedMatch = embedRe.exec(markdown)) !== null) {
    const linkPath = embedMatch[0]
      .replace('![[', '')
      .replace(/\]\].*$/, '')
      .split('|')[0]
      .split('#')[0]
      .trim()
    const resolvedPath = await resolveBaseEmbedPath(linkPath, hostPath, ctx)
    if (!resolvedPath) {
      found.push({
        label: linkPath,
        definition: '',
        sourcePath: hostPath,
        view: embedMatch[1]?.trim(),
        error: fileText.missingBaseEmbed(linkPath),
        offset: embedMatch.index,
      })
      continue
    }
    assertNotAiPrivate(resolvedPath)
    const definition = (await readToolText(resolvedPath, ctx)) ?? ''
    found.push({
      label: resolvedPath,
      definition,
      sourcePath: hostPath,
      view: embedMatch[1]?.trim(),
      thisContextUsed: THIS_REF_RE.test(definition) ? hostPath : undefined,
      offset: embedMatch.index,
    })
  }
  return found
    .sort((a, b) => a.offset - b.offset)
    .map(({ offset: _offset, ...embed }) => embed)
}

async function renderOneBase(
  embed: BaseEmbed,
  ctx: ToolExecutionContext,
): Promise<Extract<ToolResult, { kind: 'read' }>> {
  const viewLabel = embed.view ? `#${embed.view}` : ''
  if (embed.error) {
    return {
      kind: 'read',
      text: `## Base: ${embed.label}${viewLabel}\n\n(${embed.error})`,
      facts: { completeness: 'partial', errorCode: 'not_found' },
    }
  }
  if (ctx.signal?.aborted) {
    return {
      kind: 'read',
      text: text.baseAbortedResult(embed.label, viewLabel),
      facts: { completeness: 'partial', errorCode: 'aborted' },
    }
  }

  if (ctx.basesEngine) {
    const result = await ctx.basesEngine.evaluate({
      definition: embed.definition,
      view: embed.view,
      sourcePath: embed.sourcePath,
      signal: ctx.signal,
    })
    if (result.kind === 'aborted') {
      return {
        kind: 'read',
        text: text.baseAbortedResult(embed.label, viewLabel),
        facts: { completeness: 'partial', errorCode: 'aborted' },
      }
    }
    if (result.kind === 'view_not_found') {
      return {
        kind: 'read',
        text: text.viewNotFoundMessage(
          embed.label,
          embed.view ?? '',
          result.available,
        ),
        facts: { completeness: 'unsupported', errorCode: 'not_found' },
      }
    }
    if (result.kind === 'ok') {
      const totalRows = result.views.reduce(
        (sum, view) => sum + view.rows.length,
        0,
      )
      if (totalRows === 0) {
        const validation = validateBaseDefinition(embed.definition)
        if (validation.errors.length > 0) {
          return {
            kind: 'read',
            text: text.baseSyntaxErrorResult(
              embed.label,
              viewLabel,
              validation.errors,
            ),
            facts: {
              completeness: 'unsupported',
              errorCode: 'unsupported_syntax',
            },
          }
        }
      }
      const header = text.engineEvaluationHeader(
        embed.thisContextUsed,
        embed.thisIsBaseItself,
      )
      const body = `${header}\n\n${formatEvaluatedViewsMarkdown(result.views)}`
      return {
        kind: 'read',
        text: fileText.liveBaseResult(embed.label, viewLabel, body),
        facts: { completeness: 'complete' },
      }
    }
  }

  // Fallback evaluator when the Bases engine is unavailable.
  try {
    const rendered = renderBaseDefinition(ctx.app, embed.definition, {
      view: embed.view,
    })
    const header = text.fallbackEvaluationHeader(embed.thisContextUsed)
    return {
      kind: 'read',
      text: fileText.liveBaseResult(
        embed.label,
        viewLabel,
        `${header}\n\n${rendered}`,
      ),
      facts: { completeness: 'complete' },
    }
  } catch (error) {
    if (
      error instanceof UnsupportedBaseError &&
      error.message.startsWith('view not found:')
    ) {
      return {
        kind: 'read',
        text: text.viewNotFoundMessage(
          embed.label,
          embed.view ?? '',
          listViewNames(embed.definition),
        ),
        facts: { completeness: 'unsupported', errorCode: 'not_found' },
      }
    }
    const reason =
      error instanceof UnsupportedBaseError
        ? fileText.unsupportedBaseSyntax(error.message)
        : fileText.baseRenderFailure(
            error instanceof Error ? error.message : String(error),
          )
    return {
      kind: 'read',
      text: fileText.unavailableBaseRender(embed.label, viewLabel, reason),
      facts: { completeness: 'unsupported', errorCode: 'unsupported_syntax' },
    }
  }
}

export async function executeRenderBaseTool(
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const path = str(args, 'path')
  if (!path) return { kind: 'error', message: 'render_base requires "path".' }

  const resolvedFile = resolveFile(path, ctx, READABLE_TEXT_EXTENSIONS)
  const resolvedPath = resolvedFile?.path ?? normalizePath(path)
  assertNotAiPrivate(resolvedPath)

  const content = await readToolText(path, ctx)
  if (content === null)
    return { kind: 'error', message: `File not found: ${path}` }

  if (isBasePath(resolvedPath) || isBasePath(path)) {
    const contextPathArg = str(args, 'context_path')
    let sourcePath = resolvedPath
    let thisContextUsed: string | undefined

    if (contextPathArg) {
      const contextFile = resolveFile(contextPathArg, ctx, ['md'])
      if (!contextFile) {
        return {
          kind: 'error',
          message: text.contextPathNotFound(contextPathArg),
        }
      }
      assertNotAiPrivate(contextFile.path)
      sourcePath = contextFile.path
      thisContextUsed = contextFile.path
    } else if (THIS_REF_RE.test(content)) {
      const active = ctx.app.workspace?.getActiveFile?.() ?? null
      if (active && active.path !== resolvedPath) {
        assertNotAiPrivate(active.path)
        sourcePath = active.path
        thisContextUsed = active.path
      }
    }

    return renderOneBase(
      {
        label: resolvedPath,
        definition: content,
        sourcePath,
        view: str(args, 'view') ?? undefined,
        thisContextUsed,
        thisIsBaseItself: !thisContextUsed && THIS_REF_RE.test(content),
      },
      ctx,
    )
  }

  const baseEmbeds = await collectBaseEmbeds(content, resolvedPath, ctx)
  if (baseEmbeds.length > 0) {
    const results: Extract<ToolResult, { kind: 'read' }>[] = []
    for (const embed of baseEmbeds) {
      results.push(await renderOneBase(embed, ctx))
    }
    const failed = results.filter((r) => r.facts?.completeness !== 'complete')
    return {
      kind: 'read',
      facts: {
        completeness:
          failed.length === 0
            ? 'complete'
            : failed.length === results.length &&
                failed.every((r) => r.facts?.completeness === 'unsupported')
              ? 'unsupported'
              : 'partial',
        ...(failed.length ? { errorCode: failed[0].facts?.errorCode } : {}),
      },
      text: [
        fileText.embeddedBaseResult(resolvedPath),
        ...results.map((r) => r.text),
      ].join('\n\n'),
    }
  }

  return { kind: 'read', text: fileText.noBaseDefinition() }
}
