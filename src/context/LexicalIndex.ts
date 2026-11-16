import { minimatch } from 'minimatch'
import {
  App,
  CachedMetadata,
  TFile,
  getAllTags,
  normalizePath,
  parseFrontMatterAliases,
  parseYaml,
  prepareSimpleSearch,
} from 'obsidian'

import { VERBEX_DIR } from '../constants'
import { Bm25Index, computeTermFreq } from '../core/rag/bm25'
import { groupDocumentResults } from '../core/rag/documentSources/companions'
import {
  documentLexicalSegments,
  dropLexicalSource,
} from '../core/rag/documentSources/documentLexical'
import { documentQueue } from '../core/rag/documentSources/extractionQueue'
import {
  listIndexableSources,
  shouldIndexSource,
} from '../core/rag/documentSources/indexableSources'
import {
  extractMarkdownLinkTargets,
  resolveLinkedMarkdownFile,
} from '../core/rag/linkedMarkdown'
import { SourceTextReader } from '../core/rag/sourceTextReader'
import { VerbexSettings } from '../settings/schema/setting.types'
import { StartupDiagnostics } from '../utils/startupDiagnostics'
import { ensureVaultDir, nowIso } from '../verbex/vault'

const LEXICAL_INDEX_PATH = `${VERBEX_DIR}/index/bm25.json`
// Bumped when the persisted shape changes so stale snapshots are rebuilt rather
// than mis-read. v2 stores per-document term frequencies instead of full note
// bodies (content is lazy-read from the vault only for the handful of results
// that need a snippet).
const LEXICAL_SCHEMA_VERSION = 3
const FILE_READ_CONCURRENCY = 8
const COOPERATIVE_YIELD_EVERY = 8
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/
// Inline `#tag`: a hash immediately followed by tag chars (so `# Heading` and
// bare `#` are excluded). Validated afterwards to reject pure-numeric tags.
const INLINE_TAG_RE = /(?:^|\s)#([^\s#.,;:!?'"`()[\]{}]+)/g

export type LexicalDocument = {
  sourcePath?: string
  sourceSha256?: string
  startLine?: number
  endLine?: number
  documentOcrCandidatePages?: number[]
  needsOcr?: boolean
  sourceKind?: 'markdown' | 'document'
  path: string
  mtime: number
  title: string
  headings: string[]
  links: string[]
  /** Frontmatter + inline `#tags`, indexed as a weighted search signal. */
  tags: string[]
  /** Frontmatter `aliases`, indexed so alternate names match. */
  aliases: string[]
  /**
   * Pre-tokenized term frequencies of the indexable text (title, aliases,
   * headings, tags, body). Persisting this instead of the raw body keeps the
   * snapshot lean and lets the BM25 index rebuild without re-tokenizing the
   * vault. The body itself is re-read on demand for snippets only.
   */
  termFreq: Record<string, number>
  /** Token count of the indexable text, for BM25 length normalization. */
  length: number
}

export type LexicalSearchResult = {
  documentOcrCandidatePages?: number[]
  source: 'bm25'
  path: string
  title: string
  score: number
  heading: string | null
  snippet: string
  included_in_context: boolean
  startLine?: number
  endLine?: number
  companionPaths?: string[]
}

export type BacklinkResult = {
  source: 'backlink'
  path: string
  title: string
  /** Nearest heading above the sentence that references the target note. */
  heading: string | null
  /** Surrounding text in the referencing note where the link is mentioned. */
  snippet: string
}

export type TagMatchResult = {
  source: 'tag'
  path: string
  title: string
  /** Tags this note shares with the query note. */
  sharedTags: string[]
  snippet: string
}

export type LexicalIndexSnapshot = {
  schemaVersion: typeof LEXICAL_SCHEMA_VERSION
  updatedAt: string
  documentCount: number
  documents: LexicalDocument[]
}

export type LexicalIndexStats = {
  documentCount: number
  updatedAt: string | null
  indexPath: string
}

export type LexicalIndexMutation =
  | { type: 'upsert'; file: TFile }
  | { type: 'remove'; path: string }

export type LexicalIndexReconcilePlan =
  | { kind: 'full-refresh' }
  | {
      kind: 'mutations'
      mutations: LexicalIndexMutation[]
    }

export class LexicalIndexRepository {
  private snapshot: LexicalIndexSnapshot | null = null
  private bm25: Bm25Index | null = null
  private generation = 0
  private startupDiagnostics: StartupDiagnostics | null
  private lastReadStats = {
    filesConsidered: 0,
    filesRead: 0,
    charactersRead: 0,
  }

  constructor(
    private app: App,
    private settings: VerbexSettings,
    startupDiagnostics?: StartupDiagnostics,
  ) {
    this.startupDiagnostics = startupDiagnostics ?? null
    documentQueue(this.app).configure(settings)
  }

  setStartupDiagnostics(startupDiagnostics?: StartupDiagnostics): void {
    this.startupDiagnostics = startupDiagnostics ?? null
  }

  setSettings(settings: VerbexSettings): void {
    this.settings = settings
    documentQueue(this.app).configure(settings)
  }

  getGeneration(): number {
    return this.generation
  }

  peekReadySnapshot(): {
    generation: number
    snapshot: LexicalIndexSnapshot
  } | null {
    if (!this.snapshot || !this.bm25) {
      return null
    }
    return {
      generation: this.generation,
      snapshot: this.snapshot,
    }
  }

  async getReadySnapshot(
    loadFromDiskIfAvailable = true,
  ): Promise<{ generation: number; snapshot: LexicalIndexSnapshot } | null> {
    if (!this.snapshot || !this.bm25) {
      if (!loadFromDiskIfAvailable) {
        return null
      }
      await this.ensureLoaded(false)
    }
    return this.peekReadySnapshot()
  }

  async refresh(): Promise<LexicalIndexStats> {
    const refresh = async (): Promise<LexicalIndexStats> => {
      const documents = await this.readVaultDocuments()
      await this.persistDocuments(documents)
      return this.getStats()
    }
    const result = this.startupDiagnostics
      ? await this.startupDiagnostics.measure('lexical:full-refresh', refresh)
      : await refresh()
    this.startupDiagnostics?.mark('lexical:full-refresh:stats', {
      ...this.lastReadStats,
      documentCount: result.documentCount,
    })
    return result
  }

  /**
   * Incrementally add or replace a single document in the index. Used by the
   * vault `create`/`modify` event handlers so BM25 stays current without a full
   * vault rescan. Falls back to a full refresh if no snapshot is loaded yet.
   */
  async updateFile(file: TFile): Promise<void> {
    await this.applyMutations([{ type: 'upsert', file }])
  }

  /** Incrementally drop a document (vault `delete`, or note emptied/excluded). */
  async removeFile(path: string): Promise<void> {
    await this.applyMutations([{ type: 'remove', path }], false)
  }

  /** Incrementally relocate a document on vault `rename`. */
  async renameFile(oldPath: string, file: TFile): Promise<void> {
    await this.applyMutations([
      { type: 'remove', path: oldPath },
      { type: 'upsert', file },
    ])
  }

  /**
   * Apply a burst of vault changes with one snapshot write and one BM25 rebuild.
   * Obsidian emits many modify events while a note is being edited; persisting
   * after every event rewrites the complete bm25.json and rebuilds the complete
   * in-memory index repeatedly on the renderer thread.
   */
  async applyMutations(
    mutations: readonly LexicalIndexMutation[],
    refreshIfMissing = true,
  ): Promise<void> {
    if (mutations.length === 0) return
    await this.ensureLoaded(refreshIfMissing)
    if (!this.snapshot) return

    const documents = new Map(
      this.snapshot.documents.map((document) => [document.path, document]),
    )
    let changed = false
    for (const mutation of mutations) {
      if (mutation.type === 'remove') {
        changed = dropLexicalSource(documents, mutation.path) || changed
        continue
      }

      const { file } = mutation
      if (
        !shouldIndexSource(file, this.settings) ||
        !this.shouldIndexFile(file)
      ) {
        changed = dropLexicalSource(documents, file.path) || changed
        continue
      }
      if (file.extension !== 'md') {
        changed = dropLexicalSource(documents, file.path) || changed
        const p = await documentQueue(this.app).store.read(file.path)
        if (
          p &&
          p.sourceStamp.mtime === file.stat.mtime &&
          p.sourceStamp.size === file.stat.size &&
          (p.status !== 'ok' ||
            (await new SourceTextReader(this.app).read(file.path)))
        ) {
          for (const segment of await documentLexicalSegments(file, p))
            documents.set(segment.path, segment)
          changed = true
        }
        continue
      }
      const content =
        (await new SourceTextReader(this.app).read(file.path))?.text ?? ''
      if (!content.trim()) {
        changed = dropLexicalSource(documents, file.path) || changed
        continue
      }
      documents.set(
        file.path,
        buildLexicalDocument(
          file,
          content,
          this.app.metadataCache.getFileCache?.(file) ?? null,
        ),
      )
      changed = true
    }

    if (changed) {
      await this.persistDocuments([...documents.values()])
    }
  }

  private async persistDocuments(documents: LexicalDocument[]): Promise<void> {
    const snapshot: LexicalIndexSnapshot = {
      schemaVersion: LEXICAL_SCHEMA_VERSION,
      updatedAt: nowIso(),
      documentCount: new Set(documents.map((d) => d.sourcePath ?? d.path)).size,
      documents,
    }
    await ensureVaultDir(this.app, `${VERBEX_DIR}/index`)
    // JSON serialization and BM25 reconstruction are renderer-thread work.
    // Yield before each large phase so a background flush does not monopolize
    // the same event-loop turn as editor input or scrolling.
    await yieldToMainThread()
    const serialized = JSON.stringify(snapshot, null, 2)
    this.startupDiagnostics?.mark('lexical:persist', {
      documentCount: documents.length,
      serializedCharacters: serialized.length,
    })
    await yieldToMainThread()
    await this.app.vault.adapter.write(LEXICAL_INDEX_PATH, serialized)
    await yieldToMainThread()
    this.snapshot = snapshot
    this.bm25 = Bm25Index.fromTermFreqs(documents)
    this.generation += 1
  }

  /**
   * Find notes that link *to* the given target path. Outgoing links are already
   * stored per document, so backlinks are derived by resolving every stored
   * link against the vault. Each hit carries the surrounding mention text and
   * its nearest heading so the context surfaces *why* the note references the
   * target (PRD §1 link-context requirement).
   */
  async findBacklinks(
    targetPath: string,
    limit = 10,
  ): Promise<BacklinkResult[]> {
    await this.ensureLoaded()
    if (!this.snapshot) {
      return []
    }
    const results: BacklinkResult[] = []
    for (const document of this.snapshot.documents) {
      if (document.path === targetPath) {
        continue
      }
      const matchedLink = document.links.find((link) => {
        const resolved = resolveLinkedMarkdownFile({
          app: this.app,
          sourcePath: document.path,
          linkTarget: link,
        })
        return resolved?.path === targetPath
      })
      if (!matchedLink) {
        continue
      }
      const mention = findMentionContext(
        await this.readContent(document.path),
        targetPath,
        matchedLink,
      )
      results.push({
        source: 'backlink',
        path: document.path,
        title: document.title,
        heading: mention.heading,
        snippet: mention.snippet,
      })
      if (results.length >= limit) {
        break
      }
    }
    return results
  }

  /**
   * Find notes that share one or more tags with the given tag set, ranked by
   * the number of shared tags. Surfaces topically-related notes via Obsidian's
   * tag taxonomy — a structural signal independent of links or term overlap.
   */
  async findNotesByTags(
    tags: string[],
    limit = 5,
    excludePath?: string,
  ): Promise<TagMatchResult[]> {
    await this.ensureLoaded()
    if (!this.snapshot || tags.length === 0) {
      return []
    }
    const wanted = new Set(tags.map((tag) => tag.toLowerCase()))
    const matches: { document: LexicalDocument; shared: string[] }[] = []
    for (const document of this.snapshot.documents) {
      if (document.path === excludePath) {
        continue
      }
      const shared = [
        ...new Set(
          (document.tags ?? []).filter((tag) => wanted.has(tag.toLowerCase())),
        ),
      ]
      if (shared.length > 0) {
        matches.push({ document, shared })
      }
    }
    return Promise.all(
      matches
        .sort((a, b) => b.shared.length - a.shared.length)
        .slice(0, limit)
        .map(async ({ document, shared }) => ({
          source: 'tag' as const,
          path: document.path,
          title: document.title,
          sharedTags: shared,
          snippet: buildSnippet(
            await this.readContent(document.path),
            shared.join(' '),
          ),
        })),
    )
  }

  async search(
    query: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<LexicalSearchResult[]> {
    throwIfAborted(signal)
    await this.ensureLoaded()
    throwIfAborted(signal)
    if (!this.snapshot || !this.bm25) {
      return []
    }
    const max = limit ?? this.settings.verbex.search.topK
    const fileQuery = normalizePath(query.trim())
    const exactFile = (index: number): number => {
      const document = this.snapshot?.documents[index]
      const path = document?.sourcePath ?? document?.path ?? ''
      if (path === fileQuery) return 2
      return Number(
        !fileQuery.includes('/') && path.split('/').pop() === fileQuery,
      )
    }
    // File identity outranks references to that name in previews/body text.
    // Only existing indexed candidates participate; exclusions still apply.
    const allResults = this.bm25
      .search(query)
      .sort((a, b) => exactFile(b.index) - exactFile(a.index))
    const seenPaths = new Set<string>()
    const results = allResults
      .filter(({ index }) => {
        const d = this.snapshot?.documents[index]
        const path = d?.sourcePath ?? d?.path ?? ''
        const file = this.app.vault.getFileByPath?.(path)
        if (
          d?.sourceKind === 'document' &&
          (!file ||
            !shouldIndexSource(file, this.settings) ||
            file.stat.mtime !== d.mtime)
        )
          return false
        if (seenPaths.has(path)) return false
        seenPaths.add(path)
        return true
      })
      .slice(0, max)
    const maxScore = Math.max(0, ...results.map((result) => result.score))
    const resultsWithSnippets = await Promise.all(
      results.map(async ({ index, score }) => {
        throwIfAborted(signal)
        const document = this.snapshot?.documents[index]
        // Body is no longer kept in the snapshot; re-read it (from Obsidian's
        // own cache) only for these top results to build a snippet/heading.
        const body = document
          ? await this.readContent(document.sourcePath ?? document.path)
          : ''
        const content = document?.sourcePath
          ? body
              .split('\n')
              .slice((document.startLine ?? 1) - 1, document.endLine)
              .join('\n')
          : body
        return {
          source: 'bm25' as const,
          ...(document?.documentOcrCandidatePages
            ? { documentOcrCandidatePages: document.documentOcrCandidatePages }
            : {}),
          path: document?.sourcePath ?? document?.path ?? '',
          ...(document?.startLine
            ? { startLine: document.startLine, endLine: document.endLine }
            : {}),
          title: document?.title ?? '',
          score: maxScore > 0 ? score / maxScore : 0,
          heading:
            document?.sourceKind === 'document'
              ? [...new Set(document.headings)].join(' > ') || null
              : findBestHeading(content, query),
          snippet: document?.needsOcr
            ? 'Scanned document: body not indexed (needs OCR)'
            : buildSnippet(content, query),
          included_in_context: false,
        }
      }),
    )
    throwIfAborted(signal)
    return groupDocumentResults(
      this.app,
      this.settings,
      resultsWithSnippets.filter(
        (result) =>
          !/\.(hwp|hwpx|pdf)$/i.test(result.path) || result.snippet.length > 0,
      ),
    )
  }

  /** Re-read a note's body from Obsidian's in-memory cache; '' if unavailable. */
  private async readContent(path: string): Promise<string> {
    const file = this.app.vault.getFileByPath?.(path)
    if (!file) {
      return ''
    }
    try {
      return (await new SourceTextReader(this.app).read(file.path))?.text ?? ''
    } catch {
      return ''
    }
  }

  /** Exact literal counts require bodies, which the index deliberately discards. */
  async countLiteralNotes(
    keywords: string[],
    folder?: string,
  ): Promise<number[] | null> {
    await this.ensureLoaded()
    if (
      !this.snapshot ||
      !keywords.length ||
      keywords.some((word) => !word.trim())
    )
      return null
    const prefix = folder ? `${normalizePath(folder).replace(/\/$/, '')}/` : ''
    const docs = this.snapshot.documents.filter(
      (doc) =>
        doc.sourceKind !== 'document' &&
        (!prefix || normalizePath(doc.path).startsWith(prefix)),
    )
    if (docs.length > 2000) return null
    let bytes = 0
    const counts = keywords.map(() => 0)
    const words = keywords.map((word) => word.toLowerCase())
    for (const doc of docs) {
      const file = this.app.vault.getFileByPath?.(doc.path)
      if (
        !file ||
        file.stat.mtime !== doc.mtime ||
        typeof file.stat.size !== 'number'
      )
        return null
      bytes += file.stat.size
      if (bytes > 4_000_000) return null
      let body: string
      try {
        const source = await new SourceTextReader(this.app).read(file.path)
        if (!source || file.stat.mtime !== doc.mtime) return null
        body = source.text
      } catch {
        return null
      }
      const title = doc.title.toLowerCase()
      body = body.toLowerCase()
      words.forEach((word, index) => {
        if (title.includes(word) || body.includes(word)) counts[index]++
      })
    }
    return counts
  }

  async getStats(): Promise<LexicalIndexStats> {
    await this.ensureLoaded(false)
    return {
      documentCount: this.snapshot?.documentCount ?? 0,
      updatedAt: this.snapshot?.updatedAt ?? null,
      indexPath: LEXICAL_INDEX_PATH,
    }
  }

  /**
   * Compare the persisted snapshot with the current vault without writing.
   * The caller can enqueue the returned mutations behind the normal serialized
   * update queue. A missing, corrupt, or incompatible snapshot deliberately
   * falls back to a full refresh because there is no trustworthy baseline for
   * an incremental diff.
   */
  async computeReconcilePlan(): Promise<LexicalIndexReconcilePlan> {
    await this.ensureLoaded(false)
    if (!this.snapshot || !this.bm25) {
      this.startupDiagnostics?.mark('lexical:reconcile-plan', {
        kind: 'full-refresh',
        snapshotDocumentCount: this.snapshot?.documents.length ?? 0,
      })
      return { kind: 'full-refresh' }
    }

    const files = listIndexableSources(this.app, this.settings)
    const filesByPath = new Map(files.map((file) => [file.path, file]))
    const documentsByPath = new Map(
      this.snapshot.documents.map((document) => [
        document.sourcePath ?? document.path,
        document,
      ]),
    )
    const indexedPaths = new Set<string>()
    const mutations: LexicalIndexMutation[] = []

    for (const file of files) {
      if (!this.shouldIndexFile(file)) {
        continue
      }
      indexedPaths.add(file.path)
      const existing = documentsByPath.get(file.path)
      if (!existing || existing.mtime !== file.stat.mtime) {
        mutations.push({ type: 'upsert', file })
      }
    }

    for (const document of this.snapshot.documents) {
      const sourcePath = document.sourcePath ?? document.path
      const file = filesByPath.get(sourcePath)
      if (!file || !indexedPaths.has(sourcePath)) {
        mutations.push({ type: 'remove', path: sourcePath })
      }
    }

    const upsertCount = mutations.filter(
      (mutation) => mutation.type === 'upsert',
    ).length
    const removeCount = mutations.length - upsertCount
    this.startupDiagnostics?.mark('lexical:reconcile-plan', {
      kind: 'mutations',
      vaultMarkdownCount: files.length,
      snapshotDocumentCount: this.snapshot.documents.length,
      mutationCount: mutations.length,
      upsertCount,
      removeCount,
    })
    return { kind: 'mutations', mutations }
  }

  private async ensureLoaded(refreshIfMissing = true): Promise<void> {
    if (this.snapshot && this.bm25) {
      return
    }
    const indexExists = await this.app.vault.adapter.exists(LEXICAL_INDEX_PATH)
    if (indexExists) {
      const raw = await this.app.vault.adapter.read(LEXICAL_INDEX_PATH)
      let parsed: LexicalIndexSnapshot | null = null
      try {
        parsed = JSON.parse(raw) as LexicalIndexSnapshot
      } catch (error) {
        // A truncated / corrupt index (e.g. from an interrupted or overlapping
        // write) must not throw on every vault change — that floods the
        // console. Treat it as missing and rebuild it below (the rebuild
        // overwrites the bad file).
        console.warn(
          `[Verbex] Lexical (BM25) index at "${LEXICAL_INDEX_PATH}" is corrupt and will be rebuilt: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      // A snapshot from an older schema stores a different document shape
      // (e.g. full bodies, no term frequencies); rebuild from the vault rather
      // than mis-reading it.
      if (parsed && parsed.schemaVersion === LEXICAL_SCHEMA_VERSION) {
        this.snapshot = {
          ...parsed,
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
          documentCount: Array.isArray(parsed.documents)
            ? new Set(parsed.documents.map((d) => d.sourcePath ?? d.path)).size
            : parsed.documentCount,
        }
        this.bm25 = Bm25Index.fromTermFreqs(this.snapshot.documents)
        this.generation += 1
        this.startupDiagnostics?.mark('lexical:snapshot-loaded', {
          documentCount: this.snapshot.documents.length,
          schemaVersion: parsed.schemaVersion,
        })
        return
      }
      this.startupDiagnostics?.mark('lexical:snapshot-unusable', {
        exists: true,
        schemaVersion:
          parsed && typeof parsed.schemaVersion === 'number'
            ? parsed.schemaVersion
            : null,
        refreshIfMissing,
      })
    } else {
      this.startupDiagnostics?.mark('lexical:snapshot-missing', {
        refreshIfMissing,
      })
    }
    if (refreshIfMissing) {
      await this.refresh()
    }
  }

  private async readVaultDocuments(): Promise<LexicalDocument[]> {
    const files = listIndexableSources(this.app, this.settings).filter((file) =>
      this.shouldIndexFile(file),
    )
    this.lastReadStats = {
      filesConsidered: files.length,
      filesRead: 0,
      charactersRead: 0,
    }
    const documents = await mapWithConcurrency(
      files,
      FILE_READ_CONCURRENCY,
      async (file): Promise<LexicalDocument[]> => {
        if (file.extension !== 'md') {
          const p = await documentQueue(this.app).store.read(file.path)
          if (
            !p ||
            p.sourceStamp.mtime !== file.stat.mtime ||
            p.sourceStamp.size !== file.stat.size
          )
            return []
          if (
            p.status === 'ok' &&
            !(await new SourceTextReader(this.app).read(file.path))
          )
            return []
          return documentLexicalSegments(file, p)
        }
        const content =
          (await new SourceTextReader(this.app).read(file.path))?.text ?? ''
        this.lastReadStats.filesRead += 1
        this.lastReadStats.charactersRead += content.length
        if (!content.trim()) {
          return []
        }
        return [
          buildLexicalDocument(
            file,
            content,
            this.app.metadataCache.getFileCache?.(file) ?? null,
          ),
        ]
      },
    )
    return documents.flat()
  }

  private shouldIndexFile(file: TFile): boolean {
    const path = normalizePath(file.path)
    const excluded = new Set([
      ...this.settings.verbex.search.excludePaths,
      ...this.settings.ragOptions.excludePatterns,
    ])
    for (const pattern of excluded) {
      if (matchesVaultPattern(path, pattern)) {
        return false
      }
    }
    const includePatterns = this.settings.ragOptions.includePatterns
    if (includePatterns.length > 0) {
      return includePatterns.some((pattern) =>
        matchesVaultPattern(path, pattern),
      )
    }
    return true
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Related notes request aborted')
  }
}

export function matchesVaultPattern(path: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern).trim()
  if (!normalizedPattern) {
    return false
  }
  const folderPrefix = normalizedPattern.replace(/\/?$/, '/')
  return (
    path === normalizedPattern.replace(/\/$/, '') ||
    path.startsWith(folderPrefix) ||
    minimatch(path, normalizedPattern)
  )
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  let completed = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await mapper(items[index], index)
      completed += 1
      if (completed % COOPERATIVE_YIELD_EVERY === 0) {
        await yieldToMainThread()
      }
    }
  })
  await Promise.all(workers)
  return results
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/)?.[2]?.trim())
    .filter((heading): heading is string => Boolean(heading))
}

/**
 * Assemble a LexicalDocument. Structural metadata (headings, tags, aliases) is
 * taken from Obsidian's parsed {@link CachedMetadata} when available — avoiding
 * a redundant re-parse and picking up nested tags / every frontmatter shape
 * Obsidian itself recognizes — and falls back to in-content parsing when the
 * cache has not populated yet (e.g. a brand-new file). The note body is
 * tokenized once into term frequencies and then discarded.
 */
function buildLexicalDocument(
  file: TFile,
  content: string,
  cache: CachedMetadata | null,
): LexicalDocument {
  const title = file.basename
  const { headings, tags, aliases } =
    file.extension !== 'md'
      ? {
          headings: content.split('\n').filter((line) => line.startsWith('[')),
          tags: [],
          aliases: [],
        }
      : cache
        ? metaFromCache(cache)
        : metaFromContent(content)
  const { termFreq, length } = computeTermFreq(
    indexableText({ title, aliases, headings, tags, content }),
  )
  return {
    path: file.path,
    mtime: file.stat.mtime,
    title,
    headings,
    sourceKind: file.extension === 'md' ? 'markdown' : 'document',
    links: file.extension === 'md' ? extractMarkdownLinkTargets(content) : [],
    tags,
    aliases,
    termFreq,
    length,
  }
}

type StructuralMeta = { headings: string[]; tags: string[]; aliases: string[] }

/** Structural metadata read from Obsidian's parsed cache (the fast path). */
function metaFromCache(cache: CachedMetadata): StructuralMeta {
  return {
    headings: (cache.headings ?? []).map((heading) => heading.heading),
    tags: [
      ...new Set((getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, ''))),
    ],
    aliases: parseFrontMatterAliases(cache.frontmatter ?? null) ?? [],
  }
}

/** Structural metadata parsed from raw content (cache-miss fallback). */
function metaFromContent(content: string): StructuralMeta {
  const { tags, aliases } = extractTags(content)
  return { headings: extractHeadings(content), tags, aliases }
}

/**
 * Text fed to BM25 for a document. Structural fields (title, aliases, tags,
 * headings) are repeated so a match there ranks the note even when the body
 * never mentions the term — title and tags get the most weight, then aliases,
 * then headings, then the body.
 */
function indexableText(fields: {
  title: string
  aliases: string[]
  headings: string[]
  tags: string[]
  content: string
}): string {
  return [
    fields.title,
    fields.title,
    fields.aliases.join(' '),
    fields.aliases.join(' '),
    fields.headings.join(' '),
    fields.tags.join(' '),
    fields.tags.join(' '),
    fields.content,
  ].join('\n')
}

/** Frontmatter `tags`/`aliases` plus inline `#tags` from the body. */
export function extractTags(content: string): {
  tags: string[]
  aliases: string[]
} {
  const { tags: fmTags, aliases } = extractFrontmatterMeta(content)
  const tags = [...new Set([...fmTags, ...extractInlineTags(content)])]
  return { tags, aliases }
}

function extractFrontmatterMeta(content: string): {
  tags: string[]
  aliases: string[]
} {
  const match = FRONTMATTER_RE.exec(content)
  if (!match) {
    return { tags: [], aliases: [] }
  }
  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = parseYaml(match[1])
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>
    }
  } catch {
    // Malformed frontmatter is not fatal for indexing; just skip its metadata.
    return { tags: [], aliases: [] }
  }
  return {
    tags: [...normalizeTagList(data.tags), ...normalizeTagList(data.tag)],
    aliases: [
      ...normalizeStringList(data.aliases),
      ...normalizeStringList(data.alias),
    ],
  }
}

function extractInlineTags(content: string): string[] {
  const tags = new Set<string>()
  for (const match of content.matchAll(INLINE_TAG_RE)) {
    const tag = match[1].replace(/#+$/, '')
    // Obsidian tags must contain at least one non-numeric character.
    if (tag && /[^\d/]/.test(tag)) {
      tags.add(tag)
    }
  }
  return [...tags]
}

/** Normalize a frontmatter tag value: arrays, or comma/space-separated strings. */
function normalizeTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeTagList(item))
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean)
  }
  if (typeof value === 'number') {
    return [String(value)]
  }
  return []
}

/** Normalize an alias value: arrays or whole strings (spaces preserved). */
function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item))
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }
  if (typeof value === 'number') {
    return [String(value)]
  }
  return []
}

export function findBestHeading(content: string, query: string): string | null {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)
  let currentHeading: string | null = null
  for (const line of content.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/)?.[2]?.trim()
    if (heading) {
      currentHeading = heading
      continue
    }
    const lower = line.toLowerCase()
    if (queryTerms.some((term) => lower.includes(term))) {
      return currentHeading
    }
  }
  return null
}

const SNIPPET_LENGTH = 240

/**
 * Build a snippet centered on the query's first match. Match offsets come from
 * Obsidian's own `prepareSimpleSearch` (the same matcher its UI search uses),
 * which handles multi-term queries and diacritics; a plain first-term `indexOf`
 * is used when that API is unavailable (older host / test env).
 */
export function buildSnippet(content: string, query: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  let start = Math.max(firstMatchOffset(normalized, query) - 80, 0)
  let end = Math.min(start + SNIPPET_LENGTH, normalized.length)
  const splitsPair = (offset: number) =>
    offset > 0 &&
    offset < normalized.length &&
    normalized.charCodeAt(offset - 1) >= 0xd800 &&
    normalized.charCodeAt(offset - 1) <= 0xdbff &&
    normalized.charCodeAt(offset) >= 0xdc00 &&
    normalized.charCodeAt(offset) <= 0xdfff
  if (splitsPair(start)) start--
  if (splitsPair(end)) end++
  return normalized.slice(start, end)
}

function firstMatchOffset(text: string, query: string): number {
  if (typeof prepareSimpleSearch === 'function') {
    const result = prepareSimpleSearch(query)(text)
    if (result && result.matches.length > 0) {
      return Math.min(...result.matches.map(([from]) => from))
    }
  }
  const lower = text.toLowerCase()
  const hit = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => lower.indexOf(term))
    .find((index) => index >= 0)
  return hit ?? 0
}

/**
 * Locate the line that references `targetPath` (by its note basename) and
 * return the surrounding sentence plus the nearest heading above it, so a
 * backlink carries the concrete context in which it was mentioned.
 */
export function findMentionContext(
  content: string,
  targetPath: string,
  linkTarget?: string,
): { snippet: string; heading: string | null } {
  const needles = [
    targetPath.split('/').pop()?.replace(/\.md$/i, '').toLowerCase(),
    linkTarget?.split('/').pop()?.replace(/\.md$/i, '').toLowerCase(),
  ].filter((value): value is string => Boolean(value))
  const lines = content.split('\n')
  let currentHeading: string | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      currentHeading = headingMatch[2].trim()
      continue
    }
    const lowerLine = lines[i].toLowerCase()
    if (needles.some((needle) => lowerLine.includes(needle))) {
      const around = [lines[i - 1], lines[i], lines[i + 1]]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      return { snippet: around.slice(0, 300), heading: currentHeading }
    }
  }
  return {
    snippet: content.replace(/\s+/g, ' ').trim().slice(0, 240),
    heading: currentHeading,
  }
}
