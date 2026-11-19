import {
  App,
  TFile,
  getAllTags,
  normalizePath,
  parseFrontMatterAliases,
} from 'obsidian'

import type { QueryProgressState } from '../components/chat-view/QueryProgress'
import { tokenize } from '../core/rag/bm25'
import { isDocumentPath } from '../core/rag/documentSources/indexableSources'
import {
  extractMarkdownLinkTargets,
  resolveLinkedMarkdownFile,
} from '../core/rag/linkedMarkdown'
import type {
  ChunkLocator,
  RetrievalHit,
  RetrievalProvenance,
} from '../core/rag/retrievalTypes'
import { SourceTextReader } from '../core/rag/sourceTextReader'
import { selectDiverseRetrievalHits } from '../core/routing/retrievalRouting'
import { hasWholeDocumentIntent } from '../core/routing/scopeDecision'
import { isAiPrivatePath } from '../security/aiPrivatePaths'
import { VerbexSettings } from '../settings/schema/setting.types'
import { getCachedBasesResult } from '../utils/bases'
import { renderBaseDefinition } from '../utils/basesQuery'
import { executeDataviewQuery, getDataviewAPI } from '../utils/dataview'
import { estimateTokens } from '../utils/llm/estimateTokens'
import {
  type SourceCitation,
  createSourceCitation,
} from '../utils/sourceCitation'

import { isBinaryDocumentFile } from './agentSourcePolicy'
import { documentSourceContext } from './documentSourceContext'
import { effectiveContextBudget } from './effectiveContextBudget'
import { FORMAT_SOURCE_NOTICE } from './formatSourceNotice'
import {
  LexicalIndexRepository,
  LexicalSearchResult,
  extractTags,
} from './LexicalIndex'
import {
  currentSourceSnippet as createCurrentNoteSnippet,
  sourceExcerpt as createSnippet,
} from './sourceExcerpt'
import { gateStructuralLexically } from './structuralLexicalGate'

export type ContextSource =
  | 'mentioned'
  | 'current_note'
  | 'wiki'
  | 'bm25'
  | 'semantic'
  | 'wikilink'
  | 'backlink'
  | 'tag'
  | 'dataview'
  | 'base'

/** Token bucket a source draws from. Mirrors the PRD §9 priority order. */
type ContextBucket = 'current' | 'wiki' | 'search'

/** A single semantic (embedding/hybrid) retrieval hit. */
export type SemanticSearchResult = {
  path: string
  content: string
  similarity: number
  locator?: ChunkLocator
  provenance?: RetrievalProvenance[]
  sourceCitation?: SourceCitation
}

/**
 * Minimal surface ContextBuilder needs from the vector RAG engine. The upstream
 * `RAGEngine.processQuery` already performs vector + BM25 fusion (and optional
 * rerank), so satisfying this interface is enough to bring semantic recall into
 * the Verbex context — without ContextBuilder depending on the engine directly.
 */
export type SemanticSearchProvider = {
  processQuery(input: { query: string }): Promise<SemanticSearchResult[]>
  processQueryHits?: (input: {
    query: string
    onSemanticOutcome?: (
      outcome: import('../core/rag/ragEngine').SemanticQueryOutcome,
    ) => void
    withProvenance?: boolean
    hitSelection?: {
      limit?: number
      maxPerPath?: number
      expandAdjacent?: boolean
      expandGraph?: boolean
    }
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void
  }) => Promise<RetrievalHit[]>
  isSemanticSearchReady?: () => boolean
  getVectorManager?: () =>
    | import('../database/modules/vector/VectorManager').VectorManager
    | null
  getEmbeddingModel?: () =>
    | import('../types/embedding').EmbeddingModelClient
    | null
}

export type ContextItem = {
  sourceCitation?: SourceCitation
  source: ContextSource
  path: string
  score: number | null
  heading: string | null
  snippet: string
  formatSource?: boolean
  included_in_context: boolean
  exclusionReason?: 'lexical_gate' | 'final_fit'
  locator?: ChunkLocator
  provenance?: RetrievalProvenance[]
}

export type ContextBuildResult = {
  query: string
  tokenBudget: number
  estimatedTokens: number
  items: ContextItem[]
  formatSourceExclusions?: string[]
}

const DATAVIEW_BLOCK_RE = /```dataview\n([\s\S]*?)```/g
const BASE_EMBED_RE = /!?\[\[([^\]]+\.base)(?:#[^\]]*)?]]/g
/** Most curated wiki documents returned as default context per build. */
const WIKI_MAX_DOCUMENTS = 5
/** Upper bound on wiki files read per build, pre-ranked by title relevance. */
const WIKI_CANDIDATE_LIMIT = 25
/**
 * Most tag-related notes surfaced per build. Kept small: a shared tag is the
 * weakest relevance signal (two notes can share `#project` and be unrelated),
 * so this source should add a few topical neighbours, not flood the context.
 */
const TAG_RELATED_LIMIT = 3

/**
 * Within the shared search-bucket budget, the order in which sources get to
 * claim space (lower = first). Direct query relevance — semantic, then keyword —
 * outranks structural neighbours (back/wiki links, shared tags) and current-note
 * embeds (Dataview/Base). So when the search budget is tight, the query-relevant
 * hits are kept and weak structural material is the first to be dropped, instead
 * of incidental neighbours (which `build` happens to push first) crowding the
 * actual search results out. Scores are only compared *within* a source (where
 * they share a scale); across sources this fixed priority decides.
 */
export const SEARCH_SOURCE_PRIORITY: Record<ContextSource, number> = {
  semantic: 0,
  bm25: 1,
  backlink: 2,
  wikilink: 3,
  tag: 4,
  dataview: 5,
  base: 6,
  // Non-search buckets; listed only for exhaustiveness (never consulted).
  mentioned: 0,
  current_note: 0,
  wiki: 0,
}

export class ContextBuilder {
  constructor(
    private app: App,
    private settings: VerbexSettings,
    private lexicalIndex: LexicalIndexRepository,
    /**
     * Resolves the semantic search provider lazily. The vector RAG engine is
     * created on demand (and may be unavailable when no embedding model is
     * configured), so this returns null/throws gracefully and ContextBuilder
     * falls back to lexical BM25.
     */
    private getSemanticProvider?: () => Promise<SemanticSearchProvider | null>,
    /**
     * Returns the already-created semantic provider without starting PGlite.
     * When it returns null, semantic retrieval immediately falls back to BM25
     * instead of waiting for lazy database initialization.
     */
    private peekSemanticProvider?: () => SemanticSearchProvider | null,
  ) {}

  setSettings(settings: VerbexSettings): void {
    this.settings = settings
    this.lexicalIndex.setSettings(settings)
  }

  async build({
    query,
    currentFile,
    mentionedFiles,
    maxContextTokens,
    omitCurrentNoteBody = false,
    onQueryProgressChange,
    formatSources,
  }: {
    query: string
    formatSources?: readonly string[]
    currentFile?: TFile | null
    /**
     * Files the user explicitly attached as context (e.g. an `@file` or
     * `@folder` mention; folders are expanded to their nested notes upstream).
     * These are read in full and always seeded ahead of search, so an
     * explicitly-selected folder reliably puts every one of its files into
     * context instead of relying on BM25/semantic recall to surface them.
     */
    mentionedFiles?: TFile[]
    /**
     * Effective assembly budget for this build, overriding the configured
     * `maxContextTokens`. The agent run passes the model's usable input budget
     * (window − reserved output − framing already on the wire) so the assembled
     * pack can never exceed what the model can actually accept, even when the
     * configured budget is larger than the model window. Omitted → use the
     * configured budget (e.g. the Context preview command).
     */
    maxContextTokens?: number
    /** Keep current-note relations, but omit a body replaced by map-reduce. */
    omitCurrentNoteBody?: boolean
    /** Forward semantic retrieval progress to the interactive chat surface. */
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void
  }): Promise<ContextBuildResult> {
    // AI-private documents (HWP Hands) are never attached: not as the current
    // file, not as a mention, and (in pushBudgeted) not from any other bucket.
    if (currentFile && isAiPrivatePath(currentFile.path)) currentFile = null
    mentionedFiles = mentionedFiles?.filter((f) => !isAiPrivatePath(f.path))
    const configLimit = this.settings.verbex.context.maxContextTokens
    const tokenBudget =
      maxContextTokens && maxContextTokens > 0
        ? effectiveContextBudget(this.settings, maxContextTokens)
        : configLimit
    const excluded = new Set((formatSources ?? []).map(normalizePath))
    const isFormatSource = (path: string) => excluded.has(normalizePath(path))
    const formatSourceExclusions = new Set<string>()
    const excludeFormatSource = (path: string) => {
      if (!isFormatSource(path)) return false
      if (formatSourceExclusions.size < 10)
        formatSourceExclusions.add(normalizePath(path))
      return true
    }
    const items: ContextItem[] = []
    const seen = new Set<string>()

    // Seed explicitly-mentioned files first so they win their token bucket and
    // are never crowded out by search hits. Tracked so the search buckets below
    // don't re-add the same note as a lower-fidelity snippet.
    const mentionedPaths = new Set<string>()
    for (const item of await this.getMentionedFiles(
      mentionedFiles ?? [],
      query,
      Math.max(
        0,
        Math.floor(
          tokenBudget / Math.max(2, (mentionedFiles?.length ?? 0) * 2),
        ),
      ),
    )) {
      if (isFormatSource(item.path)) item.formatSource = true
      mentionedPaths.add(item.path)
      pushBudgeted(items, seen, item)
    }

    // Fetch semantic (vector/hybrid) hits once up front: they both seed the
    // search bucket and lend their query-similarity score to backlinks, so a
    // note that references the current note AND matches the query semantically
    // is ranked ahead of incidental backlinks.
    const searchMode = this.settings.verbex.search.mode
    const semanticItems =
      searchMode === 'embedding' || searchMode === 'hybrid'
        ? await this.getSemanticResults(
            query,
            onQueryProgressChange,
            excludeFormatSource,
          )
        : []
    const semanticScores = new Map<string, number>()
    for (const item of semanticItems) {
      if (typeof item.score !== 'number') continue
      const existing = semanticScores.get(item.path)
      if (existing === undefined || item.score > existing) {
        semanticScores.set(item.path, item.score)
      }
    }

    if (currentFile && isBinaryDocumentFile(currentFile)) {
      if (!omitCurrentNoteBody)
        pushBudgeted(items, seen, {
          source: 'current_note',
          ...(isFormatSource(currentFile.path) ? { formatSource: true } : {}),
          path: currentFile.path,
          score: null,
          heading: null,
          included_in_context: true,
          snippet: await documentSourceContext(
            this.app,
            currentFile.path,
            query,
            Math.max(
              0,
              Math.min(
                this.settings.verbex.context.currentNoteTokenBudget,
                Math.floor(tokenBudget / 2),
              ),
            ),
            this.settings.verbex.context.currentNoteMode !== 'snippet',
          ),
        })
    } else if (currentFile) {
      const content = isDocumentPath(currentFile.path)
        ? ((await new SourceTextReader(this.app).read(currentFile.path))
            ?.text ?? '')
        : await this.app.vault.cachedRead(currentFile)
      if (!omitCurrentNoteBody) {
        const metadataSummary = currentNoteMetadataSummary(
          this.app,
          currentFile,
        )
        const currentSnippet = createCurrentNoteSnippet(
          content,
          query,
          this.settings.verbex.context.currentNoteMode,
          Math.max(
            0,
            Math.min(
              this.settings.verbex.context.currentNoteTokenBudget,
              tokenBudget,
            ) - estimateTokens(metadataSummary ?? ''),
          ),
        )
        pushBudgeted(items, seen, {
          source: 'current_note',
          ...(isFormatSource(currentFile.path) ? { formatSource: true } : {}),
          path: currentFile.path,
          score: null,
          heading: null,
          snippet: metadataSummary
            ? `${metadataSummary}\n${currentSnippet}`
            : currentSnippet,
          included_in_context: true,
        })
      }

      for (const linked of await this.getLinkedFiles(
        currentFile,
        content,
        query,
        semanticScores,
        excludeFormatSource,
      )) {
        pushBudgeted(items, seen, linked)
      }

      // Notes that reference the current note, with the mention's context,
      // ranked by the query's semantic similarity where available.
      for (const backlink of await this.getBacklinks(
        currentFile,
        semanticScores,
      )) {
        if (!excludeFormatSource(backlink.path))
          pushBudgeted(items, seen, backlink)
      }

      // Notes sharing tags with the current note (Obsidian tag taxonomy),
      // relevance-gated symmetrically with backlinks/wikilinks.
      for (const tagItem of await this.getTagRelatedNotes(
        currentFile,
        content,
        semanticScores,
      )) {
        if (!excludeFormatSource(tagItem.path))
          pushBudgeted(items, seen, tagItem)
      }

      // Resolved Dataview blocks embedded in the current note.
      for (const dv of await this.getDataviewResults(content, currentFile)) {
        pushBudgeted(items, seen, dv)
      }

      // Cached Bases query results embedded in the current note.
      for (const base of await this.getBaseResults(content)) {
        pushBudgeted(items, seen, base)
      }
    }

    // The configured curated wiki is the default vault map. Its index stays
    // first and relevant sub-pages are selected even when no note is active.
    for (const wikiItem of await this.getWikiDocuments(
      query,
      excludeFormatSource,
    )) {
      if (
        wikiItem.path === currentFile?.path ||
        mentionedPaths.has(wikiItem.path)
      ) {
        continue
      }
      pushBudgeted(items, seen, wikiItem)
    }

    // Search bucket: semantic (vector/hybrid) and/or lexical BM25 per the
    // configured search mode. Paths are deduped across both so a note found by
    // both engines is surfaced once (semantic wins, since its ranking already
    // fuses vector + BM25 + rerank upstream). Semantic hits were fetched above.
    const searchPaths = new Set<string>()
    const semanticPaths = new Set<string>()

    let semanticCount = 0
    for (const item of semanticItems) {
      const key =
        item.locator?.unitId ?? `path:${item.path}:${item.heading ?? ''}`
      if (searchPaths.has(key) || mentionedPaths.has(item.path)) {
        continue
      }
      searchPaths.add(key)
      semanticPaths.add(item.path)
      pushBudgeted(items, seen, item)
      semanticCount += 1
    }

    // 'embedding' falls back to lexical when no semantic results are available
    // (e.g. embeddings unconfigured), so the search bucket is never empty.
    const useLexical =
      searchMode === 'bm25' ||
      searchMode === 'hybrid' ||
      (searchMode === 'embedding' && semanticCount === 0)
    let lexicalPaths = new Set<string>()
    if (useLexical) {
      let searchResults = await this.lexicalIndex.search(
        query,
        this.settings.verbex.search.topK,
      )
      const excludedCount = searchResults.filter((item) =>
        excludeFormatSource(item.path),
      ).length
      if (excludedCount)
        searchResults = await this.lexicalIndex.search(
          query,
          this.settings.verbex.search.topK + excludedCount,
        )
      searchResults = searchResults.filter(
        (item) => !excludeFormatSource(item.path),
      )
      // The floor decides whether to include BM25 results themselves; these
      // neighbors already have a structural connection, so retain pre-floor hits.
      lexicalPaths = new Set(
        searchResults
          .slice(0, this.settings.verbex.search.topK)
          .map((item) => item.path),
      )
      // Drop the weak tail relative to the best keyword hit, mirroring the
      // semantic floor: a low-scoring BM25 match that merely fits the token
      // budget is a distractor and should not be injected just because there
      // was room for it.
      const floored = applyRelativeFloor(
        searchResults,
        (result) => result.score,
        this.settings.verbex.search.lexicalRelativeFloor,
      )
      for (const result of floored.slice(0, this.settings.verbex.search.topK)) {
        if (
          semanticPaths.has(result.path) ||
          searchPaths.has(`path:${result.path}`) ||
          mentionedPaths.has(result.path)
        ) {
          continue
        }
        searchPaths.add(`path:${result.path}`)
        pushBudgeted(items, seen, lexicalToContextItem(result))
      }
    }

    const budgetedItems = includeWithinBudget(
      this.settings.verbex.search.gateStructuralRelations &&
        semanticScores.size === 0
        ? gateStructuralLexically(items, query, lexicalPaths)
        : items,
      tokenBudget,
      this.settings.verbex.context.wikiTokenBudget,
      this.settings.verbex.context.searchResultTokenBudget,
    )
    return {
      query,
      tokenBudget,
      estimatedTokens: estimateTokens(
        budgetedItems
          .filter((item) => item.included_in_context)
          .map(
            (item) =>
              item.snippet +
              (item.formatSource ? '\n' + FORMAT_SOURCE_NOTICE() : ''),
          )
          .join('\n\n'),
      ),
      items: budgetedItems,
      formatSourceExclusions: [...formatSourceExclusions],
    }
  }

  /**
   * Read every explicitly-mentioned file in full. Unlike search hits (which are
   * query-anchored snippets), an attached file or folder is the user's stated
   * focus, so the whole note content is included — bounded only by the token
   * budget, where `mentioned` shares the high-priority `current` bucket. Reads
   * are defensive: an unreadable file is skipped rather than failing the build.
   */
  private async getMentionedFiles(
    files: TFile[],
    query: string,
    documentBudget: number,
  ): Promise<ContextItem[]> {
    const items: ContextItem[] = []
    const seenPaths = new Set<string>()
    for (const file of files) {
      if (seenPaths.has(file.path)) {
        continue
      }
      seenPaths.add(file.path)
      try {
        if (isBinaryDocumentFile(file)) {
          items.push({
            source: 'mentioned',
            path: file.path,
            score: null,
            heading: null,
            included_in_context: true,
            snippet: await documentSourceContext(
              this.app,
              file.path,
              query,
              documentBudget,
              true,
            ),
          })
          continue
        }
        let content: string
        if (file.extension === 'base') {
          content =
            (await this.renderBase(file.path)) ??
            (await this.app.vault.cachedRead(file))
        } else {
          content = isDocumentPath(file.path)
            ? ((await new SourceTextReader(this.app).read(file.path))?.text ??
              '')
            : await this.app.vault.cachedRead(file)
        }
        if (!content.trim()) {
          continue
        }
        items.push({
          source: 'mentioned',
          path: file.path,
          score: null,
          heading: firstHeading(content),
          snippet: content.trim(),
          included_in_context: true,
        })
      } catch {
        // An attached file that can't be read is skipped; the rest still load.
      }
    }
    return items
  }

  /**
   * Semantic retrieval via the vector RAG engine. Location-aware providers use
   * the revision-bound routing contract; legacy providers retain the historical
   * one-item-per-path compatibility behavior.
   */
  private async getSemanticResults(
    query: string,
    onQueryProgressChange?: (queryProgress: QueryProgressState) => void,
    isFormatSource: (path: string) => boolean = () => false,
  ): Promise<ContextItem[]> {
    if (!this.getSemanticProvider) {
      return []
    }
    let provider: SemanticSearchProvider | null = null
    if (this.peekSemanticProvider) {
      try {
        provider = this.peekSemanticProvider()
      } catch {
        return []
      }
      if (!provider) {
        return []
      }
    } else {
      try {
        provider = await this.getSemanticProvider()
      } catch {
        return []
      }
    }
    if (!provider) {
      return []
    }
    try {
      if (provider.processQueryHits) {
        const graphFusionEnabled = this.settings.ragOptions.expandGraph
        const hits = await provider.processQueryHits({
          query,
          hitSelection: graphFusionEnabled
            ? {
                limit: this.settings.verbex.search.topK,
                maxPerPath: 2,
                expandAdjacent: false,
                expandGraph: true,
              }
            : {
                limit: this.settings.verbex.search.topK,
                maxPerPath: 2,
              },
          onQueryProgressChange,
        })
        const eligibleHits = hits.filter(
          (hit) => !isFormatSource(hit.locator.path),
        )
        const routedHits = graphFusionEnabled
          ? eligibleHits
          : selectDiverseRetrievalHits(eligibleHits, {
              limit: this.settings.verbex.search.topK,
              maxPerPath: 2,
            })
        const routed = routedHits.map((hit) => ({
          hit,
          similarity: retrievalHitScore(hit),
        }))
        const gated = applyRelativeFloor(
          routed,
          (result) => result.similarity,
          this.settings.verbex.search.semanticRelativeFloor,
        )
        return Promise.all(
          gated.map(async ({ hit, similarity }) => {
            const content = hit.content ?? ''
            let sourceCitation: SourceCitation | null = null
            try {
              const file = this.app.vault.getFileByPath(hit.locator.path)
              if (file && content) {
                sourceCitation = await createSourceCitation(
                  file.path,
                  await this.app.vault.cachedRead(file),
                  hit.locator.startLine,
                  hit.locator.endLine,
                  content,
                )
              }
            } catch {
              /* a source that cannot be checked has no location link */
            }
            return {
              source: 'semantic' as const,
              ...(hit.locator.documentOcrCandidatePages
                ? {
                    documentOcrCandidatePages:
                      hit.locator.documentOcrCandidatePages,
                  }
                : {}),
              path: hit.locator.path,
              score: similarity,
              heading: firstHeading(content),
              snippet: content
                ? createSnippet(content, query, 600, hit.locator.startLine)
                : `[retrieval candidate] ${hit.locator.path} L${hit.locator.startLine}-${hit.locator.endLine}`,
              included_in_context: true,
              locator: hit.locator,
              ...(sourceCitation ? { sourceCitation } : {}),
              provenance: [...hit.provenance],
            }
          }),
        )
      }
      const results = await provider.processQuery({ query })
      const byPath = new Map<string, SemanticSearchResult>()
      for (const result of results) {
        if (isFormatSource(result.path)) continue
        const existing = byPath.get(result.path)
        if (!existing || result.similarity > existing.similarity) {
          byPath.set(result.path, result)
        }
      }
      const ranked = [...byPath.values()].sort(
        (a, b) => b.similarity - a.similarity,
      )
      // Drop the weak tail: hits far less relevant than the best match are
      // distractors, not signal. Relative (vs. absolute) so it holds across
      // embedding models with different similarity scales. The top hit always
      // survives so a valid-but-low-scale match is never wiped out entirely.
      const gated = applyRelativeFloor(
        ranked,
        (result) => result.similarity,
        this.settings.verbex.search.semanticRelativeFloor,
      )
      return gated.slice(0, this.settings.verbex.search.topK).map((result) => ({
        source: 'semantic' as const,
        path: result.path,
        score: result.similarity,
        heading: firstHeading(result.content),
        snippet: createSnippet(result.content, query, 600),
        included_in_context: true,
      }))
    } catch {
      // Semantic search is an optional enhancement; never fail the build over it.
      return []
    }
  }

  /**
   * Read index.md plus the most query-relevant documents in the configured
   * curated wiki folder. The wiki index is always kept as a default map; the
   * remaining pages are ranked by query relevance (CJK-aware token overlap over
   * title + body). Reads are bounded by a candidate cap to stay cheap.
   * Defensive against vaults/tests without these files.
   */
  private async getWikiDocuments(
    query: string,
    isFormatSource: (path: string) => boolean,
  ): Promise<ContextItem[]> {
    const folder = normalizePath(this.settings.vaultWikiFolder.trim()).replace(
      /\/$/,
      '',
    )
    if (!folder) return []
    const indexPath = `${folder}/index.md`
    try {
      const files = this.app.vault.getMarkdownFiles?.() ?? []
      const wikiFiles = files.filter(
        (file) =>
          (file.path === indexPath || file.path.startsWith(`${folder}/`)) &&
          !isFormatSource(file.path),
      )
      if (wikiFiles.length === 0) {
        return []
      }
      const queryTokens = [...new Set(tokenize(query))]

      // Bound disk reads: keep the root index plus the best title matches.
      const candidates = wikiFiles
        .map((file) => ({
          file,
          isIndex: file.path === indexPath,
          titleScore: relevanceScore(file.basename, queryTokens),
        }))
        .sort((a, b) =>
          a.isIndex !== b.isIndex
            ? a.isIndex
              ? -1
              : 1
            : b.titleScore - a.titleScore,
        )
        .slice(0, WIKI_CANDIDATE_LIMIT)

      const scored: {
        file: TFile
        content: string
        score: number
        isIndex: boolean
      }[] = []
      for (const { file, isIndex } of candidates) {
        const content = await this.app.vault.cachedRead(file)
        if (!content.trim()) {
          continue
        }
        scored.push({
          file,
          content,
          score: relevanceScore(`${file.basename}\n${content}`, queryTokens),
          isIndex,
        })
      }

      // Root index.md stays first; rank the rest by body relevance.
      scored.sort((a, b) =>
        a.isIndex !== b.isIndex ? (a.isIndex ? -1 : 1) : b.score - a.score,
      )
      return scored
        .slice(0, WIKI_MAX_DOCUMENTS)
        .map(({ file, content, score }) => ({
          source: 'wiki' as const,
          path: file.path,
          score: score > 0 ? score : null,
          heading: file.basename,
          snippet: createSnippet(content, query, 1500),
          included_in_context: true,
        }))
    } catch {
      // Curated wiki documents are optional context; ignore when unavailable.
      return []
    }
  }

  /**
   * Breadth-first link expansion from the current note, following links up to
   * `linkExpansionDepth` hops (1–3). This walks the wikilink graph instead of
   * only the note's direct links.
   * The mention context is taken from the *parent* note where each link appears,
   * so a deep hit still explains why it was reached. Capped by
   * `linkedMarkdownFileLimit` and deduped so cycles can't loop.
   *
   * Relevance-gated symmetrically with backlinks: in embedding/hybrid mode each
   * linked note carries the query's semantic similarity where available, and
   * when `gateStructuralRelations` is on, links that the semantic search did not
   * surface are dropped as structural noise (a note the current note links to but
   * unrelated to the request). BM25-only mode keeps all links, as before.
   */
  private async getLinkedFiles(
    file: TFile,
    content: string,
    queryText: string,
    semanticScores: Map<string, number>,
    isFormatSource: (path: string) => boolean,
  ): Promise<ContextItem[]> {
    const depth = Math.max(this.settings.verbex.search.linkExpansionDepth, 0)
    const limit = this.settings.ragOptions.linkedMarkdownFileLimit
    if (depth === 0 || limit <= 0) {
      return []
    }
    const items: ContextItem[] = []
    const visited = new Set([file.path])
    let frontier: { path: string; content: string; depth: number }[] = [
      { path: file.path, content, depth: 0 },
    ]

    while (frontier.length > 0 && items.length < limit) {
      const nextFrontier: typeof frontier = []
      for (const node of frontier) {
        if (node.depth >= depth || items.length >= limit) {
          continue
        }
        for (const target of extractMarkdownLinkTargets(node.content)) {
          if (items.length >= limit) {
            break
          }
          const resolved = resolveLinkedMarkdownFile({
            app: this.app,
            sourcePath: node.path,
            linkTarget: target,
          })
          if (
            !resolved ||
            visited.has(resolved.path) ||
            isFormatSource(resolved.path) ||
            isAiPrivatePath(resolved.path)
          ) {
            continue
          }
          visited.add(resolved.path)
          const linkedContent = await this.app.vault.cachedRead(resolved)
          const heading = firstHeading(linkedContent)
          // Surrounding context in the *parent* note where the link appears,
          // plus the target note's opening section (PRD §1 link-context).
          const mention = mentionSnippet(node.content, target)
          const targetSnippet = createSnippet(linkedContent, queryText, 600)
          items.push({
            source: 'wikilink',
            // Reflect the query's semantic similarity when the linked note also
            // surfaced in semantic search; otherwise leave it unscored (and,
            // when gating, drop it below).
            path: resolved.path,
            score: semanticScores.get(resolved.path) ?? null,
            heading,
            snippet: mention
              ? `Mention context: ${mention}\nTarget excerpt: ${targetSnippet}`
              : targetSnippet,
            included_in_context: true,
          })
          nextFrontier.push({
            path: resolved.path,
            content: linkedContent,
            depth: node.depth + 1,
          })
        }
      }
      frontier = nextFrontier
    }
    // Symmetric with getBacklinks: when semantic scoring is available and
    // structural gating is on, a linked note that did not also match the query
    // is structural noise, so drop it. BFS order is preserved (no re-sort) since
    // depth/discovery order is meaningful for link context.
    const gate =
      this.settings.verbex.search.gateStructuralRelations &&
      semanticScores.size > 0
    return gate ? items.filter((item) => item.score !== null) : items
  }

  private async getBacklinks(
    file: TFile,
    semanticScores: Map<string, number>,
  ): Promise<ContextItem[]> {
    if (typeof this.lexicalIndex.findBacklinks !== 'function') {
      return []
    }
    try {
      const backlinks = await this.lexicalIndex.findBacklinks(file.path, 5)
      // When semantic scoring is available, a backlink is a relevance signal
      // only if the linking note also matches the query: a note that links to
      // the current note but has nothing to do with the request is structural
      // noise, so drop it. With no semantic scores (BM25-only) we can't tell, so
      // keep all backlinks as before.
      const gate =
        this.settings.verbex.search.gateStructuralRelations &&
        semanticScores.size > 0
      return backlinks
        .map((backlink) => ({
          source: 'backlink' as const,
          path: backlink.path,
          // Reflect the query's semantic similarity when the backlinking note
          // also surfaced in semantic search; otherwise leave it unscored.
          score: semanticScores.get(backlink.path) ?? null,
          heading: backlink.heading,
          snippet: backlink.snippet,
          included_in_context: true,
        }))
        .filter((item) => !gate || item.score !== null)
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    } catch {
      return []
    }
  }

  /**
   * Notes that share tags with the current note, surfaced as a distinct `tag`
   * source. The shared-tag count is the score, so the most topically-aligned
   * notes rank first (and it renders as "공유 태그 N개"). No-op when the note has
   * no tags or the index predates tag support.
   *
   * Relevance-gated symmetrically with backlinks/wikilinks: a shared tag is the
   * weakest relevance signal (two notes can share `#project` and be unrelated),
   * so when semantic scoring is available and `gateStructuralRelations` is on, a
   * tag neighbour that the semantic search did not also surface is dropped as
   * structural noise. BM25-only mode (no semantic scores) keeps all matches, as
   * before. The score stays the shared-tag count either way.
   */
  private async getTagRelatedNotes(
    file: TFile,
    content: string,
    semanticScores: Map<string, number>,
  ): Promise<ContextItem[]> {
    if (typeof this.lexicalIndex.findNotesByTags !== 'function') {
      return []
    }
    try {
      const { tags } = extractTags(content)
      if (tags.length === 0) {
        return []
      }
      const matches = await this.lexicalIndex.findNotesByTags(
        tags,
        TAG_RELATED_LIMIT,
        file.path,
      )
      const gate =
        this.settings.verbex.search.gateStructuralRelations &&
        semanticScores.size > 0
      return matches
        .filter((match) => !gate || semanticScores.has(match.path))
        .map((match) => ({
          source: 'tag' as const,
          path: match.path,
          score: match.sharedTags.length,
          heading: match.sharedTags.map((tag) => `#${tag}`).join(' '),
          snippet: match.snippet,
          included_in_context: true,
        }))
    } catch {
      return []
    }
  }

  private async getDataviewResults(
    content: string,
    file: TFile,
  ): Promise<ContextItem[]> {
    if (!getDataviewAPI(this.app)) {
      return []
    }
    const items: ContextItem[] = []
    for (const match of content.matchAll(DATAVIEW_BLOCK_RE)) {
      const dvQuery = match[1].trim()
      if (!dvQuery) {
        continue
      }
      const result = await executeDataviewQuery(dvQuery, this.app)
      items.push({
        source: 'dataview',
        path: `${file.path} · dataview`,
        score: null,
        heading: dvQuery.split('\n')[0],
        snippet: result.slice(0, 1200),
        included_in_context: true,
      })
    }
    return items
  }

  private async getBaseResults(content: string): Promise<ContextItem[]> {
    const items: ContextItem[] = []
    for (const match of content.matchAll(BASE_EMBED_RE)) {
      const basePath = match[1].trim()
      const rendered = await this.renderBase(basePath)
      if (!rendered) {
        continue
      }
      items.push({
        source: 'base',
        path: basePath,
        score: null,
        heading: null,
        snippet: rendered.slice(0, 1200),
        included_in_context: true,
      })
    }
    return items
  }

  private async renderBase(basePath: string): Promise<string | null> {
    const file = this.app.vault.getFileByPath(basePath)
    if (file?.extension === 'base') {
      try {
        return renderBaseDefinition(
          this.app,
          await this.app.vault.cachedRead(file),
        )
      } catch {
        // Fall through to cached render below.
      }
    }
    return getCachedBasesResult(basePath)
  }
}

/**
 * Drop the weak tail of a ranked result list relative to its best score, so
 * distractors far less relevant than the top hit never enter the context. The
 * threshold is relative (bestScore * floor) rather than absolute so it holds
 * across scoring scales (cosine similarity vs. unbounded BM25). The single best
 * hit always survives; a floor <= 0 (or an all-zero list) disables the trim.
 */
export function applyRelativeFloor<T>(
  ranked: T[],
  scoreOf: (item: T) => number,
  floor: number,
): T[] {
  if (floor <= 0 || ranked.length === 0) {
    return ranked
  }
  const best = Math.max(...ranked.map(scoreOf))
  if (best <= 0) {
    return ranked
  }
  return ranked.filter(
    (item, index) => index === 0 || scoreOf(item) >= best * floor,
  )
}

function retrievalHitScore(hit: RetrievalHit): number {
  return (
    [
      hit.scores.final,
      hit.scores.rerank,
      hit.scores.vector,
      hit.scores.bm25,
      hit.scores.graph,
    ].find((score) => score !== undefined && Number.isFinite(score)) ?? 0
  )
}

function lexicalToContextItem(result: LexicalSearchResult): ContextItem {
  return {
    source: result.source,
    ...(result.documentOcrCandidatePages
      ? { documentOcrCandidatePages: result.documentOcrCandidatePages }
      : {}),
    path: result.path,
    score: result.score,
    heading: result.heading,
    snippet: result.snippet,
    included_in_context: true,
  }
}

function pushBudgeted(
  items: ContextItem[],
  seen: Set<string>,
  item: ContextItem,
): void {
  const key = item.locator
    ? `${item.source}:unit:${item.locator.unitId}`
    : `${item.source}:${item.path}:${item.heading ?? ''}`
  if (seen.has(key) || isAiPrivatePath(item.path)) {
    return
  }
  seen.add(key)
  items.push(item)
}

export function bucketOf(source: ContextSource): ContextBucket {
  // Explicitly-attached files share the current-note bucket: both are the
  // user's stated focus and get the full token budget ahead of search hits.
  if (source === 'mentioned' || source === 'current_note') {
    return 'current'
  }
  if (source === 'wiki') {
    return 'wiki'
  }
  // bm25, semantic, wikilink, backlink, tag, dataview, base
  return 'search'
}

/**
 * Allocate the token budget by priority bucket (current note → wiki → search)
 * instead of a single running total. Each bucket has its own cap so a flood of
 * search hits can never starve the current note or wiki, and the overall budget
 * still bounds the sum.
 *
 * The current/wiki buckets are filled in push order (priority is already encoded
 * by the order `build` adds them). The search bucket is filled in *relevance*
 * order — {@link SEARCH_SOURCE_PRIORITY}, then score descending within a source
 * — so a tight search budget keeps the query-relevant hits (semantic/keyword)
 * and drops weak structural neighbours first, regardless of the order they were
 * pushed. The returned array preserves the original item order (only the
 * `included_in_context` flags change), so downstream grouping/tracing is stable.
 */
export function includeWithinBudget(
  items: ContextItem[],
  tokenBudget: number,
  wikiBudget: number,
  searchBudget: number,
): ContextItem[] {
  const bucketBudgets: Record<ContextBucket, number> = {
    current: tokenBudget,
    wiki: Math.min(wikiBudget, tokenBudget),
    search: Math.min(searchBudget, tokenBudget),
  }
  const bucketUsed: Record<ContextBucket, number> = {
    current: 0,
    wiki: 0,
    search: 0,
  }
  const tokensOf = items.map((item) =>
    estimateTokens(
      item.snippet + (item.formatSource ? '\n' + FORMAT_SOURCE_NOTICE() : ''),
    ),
  )
  const included = new Set<number>()
  let totalUsed = 0

  const tryInclude = (index: number): void => {
    const item = items[index]
    if (!item.included_in_context) {
      return
    }
    const bucket = bucketOf(item.source)
    const tokens = tokensOf[index]
    if (
      bucketUsed[bucket] + tokens <= bucketBudgets[bucket] &&
      totalUsed + tokens <= tokenBudget
    ) {
      bucketUsed[bucket] += tokens
      totalUsed += tokens
      included.add(index)
    }
  }

  // Pass 1: current & wiki buckets in push order.
  items.forEach((item, index) => {
    if (bucketOf(item.source) !== 'search') {
      tryInclude(index)
    }
  })

  // Pass 2: search bucket in relevance order (source priority, then score desc),
  // so high-signal hits claim the shared budget before weak structural ones.
  items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => bucketOf(item.source) === 'search')
    .sort((a, b) => {
      const priorityDelta =
        SEARCH_SOURCE_PRIORITY[a.item.source] -
        SEARCH_SOURCE_PRIORITY[b.item.source]
      if (priorityDelta !== 0) {
        return priorityDelta
      }
      return (b.item.score ?? -Infinity) - (a.item.score ?? -Infinity)
    })
    .forEach(({ index }) => tryInclude(index))

  return items.map((item, index) => ({
    ...item,
    included_in_context: included.has(index),
  }))
}

function firstHeading(content: string): string | null {
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      return match[2].trim()
    }
  }
  return null
}

export function isWholeCurrentNoteIntent(query: string): boolean {
  return hasWholeDocumentIntent(query)
}

function currentNoteMetadataSummary(app: App, file: TFile): string | null {
  const cache = app.metadataCache?.getFileCache?.(file)
  const parts: string[] = []

  if (cache) {
    const tags = [
      ...new Set((getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, ''))),
    ].filter(Boolean)
    if (tags.length > 0) {
      parts.push(`tags: ${tags.map((tag) => `#${tag}`).join(' ')}`)
    }

    const aliases = parseFrontMatterAliases(cache.frontmatter ?? null) ?? []
    if (aliases.length > 0) {
      parts.push(`aliases: ${aliases.join(', ')}`)
    }
  }

  const unresolved = app.metadataCache?.unresolvedLinks?.[file.path] ?? {}
  const unresolvedItems = Object.entries(unresolved)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([target, count]) => `${target} (${count})`)
  if (unresolvedItems.length > 0) {
    const total = Object.keys(unresolved).length
    parts.push(
      `unresolved links: ${unresolvedItems.join(', ')}${
        total > unresolvedItems.length
          ? `, ...+${total - unresolvedItems.length}`
          : ''
      }`,
    )
  }

  return parts.length > 0 ? `[Obsidian metadata] ${parts.join('; ')}` : null
}

/**
 * Count how many query tokens appear in the text (with multiplicity), using the
 * same CJK-aware tokenizer as BM25 so Korean/Han terms match by n-gram. A cheap
 * relevance proxy for ranking curated wiki documents against the query.
 */
function relevanceScore(text: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) {
    return 0
  }
  const counts = new Map<string, number>()
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  let score = 0
  for (const token of queryTokens) {
    score += counts.get(token) ?? 0
  }
  return score
}

/** Surrounding text in the source note around where a link target is mentioned. */
function mentionSnippet(content: string, target: string): string | null {
  const needle = target.split('/').pop()?.replace(/\.md$/i, '').toLowerCase()
  if (!needle) {
    return null
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(needle)) {
      return [lines[i - 1], lines[i], lines[i + 1]]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240)
    }
  }
  return null
}
