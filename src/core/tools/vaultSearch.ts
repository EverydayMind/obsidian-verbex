import {
  App,
  TFile,
  getAllTags,
  normalizePath,
  parseFrontMatterAliases,
  prepareSimpleSearch,
} from 'obsidian'

import {
  LexicalIndexRepository,
  LexicalSearchResult,
} from '../../context/LexicalIndex'
import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { isAiPrivatePath } from '../../security/aiPrivatePaths'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { Bm25Index } from '../rag/bm25'

import { parseHeadings, splitLines } from './noteSlicing'

export async function searchNoteMeta(app: App, file: TFile) {
  if (file.extension !== 'md')
    return {
      lines: 0,
      chars: 0,
      tokens: 0,
      firstHeading: null,
      summary: `size=${file.stat?.size ?? 'unknown'}B\tformat=${file.extension}\ttext_metrics=not_measured`,
    }
  const content = await app.vault.cachedRead(file)
  const lines = splitLines(content)
  const firstHeading = parseHeadings(lines)[0]?.heading ?? null
  const tokens = estimateTokens(content)
  const size =
    typeof file.stat?.size === 'number' ? file.stat.size : content.length
  return {
    lines: lines.length,
    chars: content.length,
    tokens,
    firstHeading,
    summary: `size=${size}B\tlines=${lines.length}\tchars=${content.length}\ttokens~${tokens}`,
  }
}

/** Shape of the plugin instance we reach for via `app.plugins.getPlugin`. */
type VerbexPluginLike = {
  verbexController?: { lexicalIndex?: LexicalIndexRepository }
}

function getVerbexLexicalIndex(app: App): LexicalIndexRepository | null {
  const plugins = (
    app as App & {
      plugins?: { getPlugin(id: string): VerbexPluginLike | null }
    }
  ).plugins
  return plugins?.getPlugin('verbex')?.verbexController?.lexicalIndex ?? null
}

export function literalSearchGuidance(locale?: ModelLocale) {
  return L(
    {
      ko: '나머지를 확인하려면 폴더의 파일을 전부 나열하고 각 파일의 본문을 검색하세요.',
      en: 'To check the rest, list all files in the folder and search the body of each file.',
    },
    locale,
  )
}

export function resolveSearchFolder(
  app: App,
  query: string | null,
  folderArg: string | null,
): string | undefined {
  const matches = [
    ...(query ?? '').matchAll(/(?:^|\s)path:(?:"([^"]+)"|([^\s"]+))/gi),
  ]
  const normalize = (value: string | null | undefined): string | undefined => {
    if (!value?.trim()) return undefined
    assertUserVaultPath(app, value.trim())
    return normalizePath(value.trim()).replace(/\/+$/, '') || undefined
  }
  const explicit = normalize(folderArg)
  const fromQuery =
    matches.length === 1 ? normalize(matches[0][1] ?? matches[0][2]) : undefined
  if (explicit && fromQuery && explicit !== fromQuery)
    throw new Error(
      'search_vault: folder and query path: specify different folders.',
    )
  return explicit ?? fromQuery
}

export async function literalSearchFact(
  app: App,
  keywords: string[],
  query: string | null | undefined,
  explicitKeywords: boolean,
  folderArg?: string | null,
): Promise<{ countFact: string; folder?: string }> {
  const folderMatches = [
    ...(query ?? '').matchAll(/(?:^|\s)path:(?:"([^"]+)"|([^\s"]+))/gi),
  ]
  const folderMatch = folderMatches[0]
  const queryFolder = folderMatch?.[1] ?? folderMatch?.[2]
  const folder = folderArg ?? undefined
  const validScope =
    !(query ?? '').match(/path:/gi)?.length ||
    ((query ?? '').match(/path:/gi)?.length === 1 &&
      folderMatches.length === 1 &&
      !!queryFolder)
  const index = getVerbexLexicalIndex(app)
  const counts =
    validScope &&
    (explicitKeywords || !queryFolder) &&
    typeof index?.countLiteralNotes === 'function'
      ? await index.countLiteralNotes(keywords, folder)
      : null
  const countFact = counts
    ? keywords
        .map((word, i) =>
          L({
            ko: `"${word}" 문자 그대로 일치하는 색인 노트 전체 ${counts[i]}개${folder ? ` (폴더 ${folder})` : ''}`,
            en: `Total indexed notes with literal matches for "${word}": ${counts[i]}${folder ? ` (folder ${folder})` : ''}`,
          }),
        )
        .join('; ') +
      L({
        ko: ' (문자 일치 수는 색인 스냅샷의 Markdown 노트 기준, 후보에는 문서 투영도 포함; 계산 상한 2,000개·4MB)',
        en: ' (literal counts cover Markdown notes in the index snapshot; candidates also include document projections; calculation limits: 2,000 notes and 4 MB)',
      })
    : L({
        ko: '문자 그대로 일치하는 색인 노트 전체 수는 계산하지 않음',
        en: 'Total indexed notes with literal matches was not calculated',
      })
  return { countFact, folder }
}

export type RankedVaultSearchResult = {
  file: TFile
  score: number
  snippet: string
}

export async function searchVaultWithBm25(
  app: App,
  query: string,
  {
    maxResults = 30,
    maxFileChars = 100_000,
    snippetChars = 160,
    folder,
  }: {
    maxResults?: number
    maxFileChars?: number
    snippetChars?: number
    folder?: string
  } = {},
): Promise<RankedVaultSearchResult[]> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return []
  }

  // Reuse the plugin's incrementally-maintained lexical index when it is loaded,
  // so a search neither re-reads the vault nor rebuilds an index from scratch.
  const lexicalIndex = getVerbexLexicalIndex(app)
  if (lexicalIndex) {
    const results = await lexicalIndex.search(
      normalizedQuery,
      maxResults,
      undefined,
      { pathPrefix: folder },
    )
    return results.flatMap((result: LexicalSearchResult) => {
      const file = app.vault.getFileByPath(result.path)
      return file instanceof TFile && !isAiPrivatePath(file.path)
        ? [{ file, score: result.score, snippet: result.snippet }]
        : []
    })
  }

  const documents: { file: TFile; content: string; indexable: string }[] = []
  for (const file of app.vault.getMarkdownFiles()) {
    if (isAiPrivatePath(file.path)) continue
    let content: string
    try {
      content = await app.vault.cachedRead(file)
    } catch {
      continue
    }
    if (content.length > maxFileChars) {
      content = content.slice(0, maxFileChars)
    }
    documents.push({
      file,
      content,
      // Weight the title and structural metadata (tags, aliases) alongside the
      // body so a note matches on its name/tags even when the term is absent
      // from the text — mirroring the plugin's primary lexical index.
      indexable: [
        file.basename ?? file.path,
        file.basename ?? file.path,
        file.path,
        structuralMetaText(app, file),
        content,
      ].join('\n'),
    })
  }

  const index = new Bm25Index(documents.map((doc) => doc.indexable))
  return index
    .search(normalizedQuery)
    .filter(
      ({ index: docIndex }) =>
        !folder ||
        documents[docIndex].file.path === folder ||
        documents[docIndex].file.path.startsWith(`${folder}/`),
    )
    .slice(0, maxResults)
    .map(({ index: docIndex, score }) => {
      const doc = documents[docIndex]
      return {
        file: doc.file,
        score,
        snippet: createSearchSnippet(
          doc.content,
          normalizedQuery,
          snippetChars,
        ),
      }
    })
}

/** Title-independent structural signal (tags, aliases) from Obsidian's cache. */
function structuralMetaText(app: App, file: TFile): string {
  const cache = app.metadataCache.getFileCache?.(file)
  if (!cache) {
    return ''
  }
  const tags = (getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, ''))
  const aliases = parseFrontMatterAliases(cache.frontmatter ?? null) ?? []
  return [...tags, ...aliases].join(' ')
}

/**
 * Snippet centered on the query's first match, using Obsidian's own
 * `prepareSimpleSearch` matcher for accurate (multi-term, diacritic-aware)
 * offsets, with a plain `indexOf` fallback when the API is unavailable.
 */
function createSearchSnippet(
  content: string,
  query: string,
  maxLength: number,
): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  let hit = 0
  if (typeof prepareSimpleSearch === 'function') {
    const result = prepareSimpleSearch(query)(normalized)
    if (result && result.matches.length > 0) {
      hit = Math.min(...result.matches.map(([from]) => from))
    }
  } else {
    const lower = normalized.toLowerCase()
    hit =
      query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => lower.indexOf(term))
        .find((index) => index >= 0) ?? 0
  }
  const start = Math.max(hit - 60, 0)
  return normalized.slice(start, start + maxLength)
}
