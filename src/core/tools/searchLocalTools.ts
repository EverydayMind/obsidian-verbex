import { TFile, normalizePath } from 'obsidian'

import {
  SemanticSearchProvider,
  applyRelativeFloor,
} from '../../context/ContextBuilder'
import { L } from '../../i18n/modelText'
import {
  MAX_DATAVIEW_QUERY_CHARS,
  boundDataviewResult,
  executeDataviewQueryResult,
} from '../../utils/dataview'
import { searchObsidianQuery } from '../../utils/obsidian-query'
import {
  ResolvedLinks,
  backlinks,
  headingOutline,
  noteTags,
  outgoingLinks,
  unresolvedFor,
} from '../../utils/vault-relations'
import { tokenize } from '../rag/bm25'

import { Candidate, rankContextCandidates } from './contextCandidatesRanking'
import { executeFileListing, listedFiles } from './fileListing'
import { buildGraphStats } from './graphRelations'
import { createIterativeClues } from './iterativeClues'
import {
  SemanticFact,
  ToolArgs,
  ToolExecutionContext,
  ToolResult,
  resolveFile,
  semanticAvailabilityFact,
  str,
} from './localToolCommon'
import { executeNoteContext } from './searchNoteContext'
import {
  boundedGraphText,
  boundedPositiveInteger,
  cleanIterativeClue,
  semanticCandidates,
  semanticResultFact,
} from './semanticToolSearch'
import { sourceReadHint } from './sourceReadHint'
import {
  literalSearchFact,
  literalSearchGuidance,
  searchNoteMeta,
  searchVaultWithBm25,
} from './vaultSearch'

const DEFAULT_CANDIDATE_LIMIT = 15
const MAX_SEARCH_VAULT_RESULTS = 30
const MAX_GRAPH_EXPANSION_DEGREE = 40
const DEFAULT_ITERATIVE_SEARCH_ROUNDS = 4
const MAX_ITERATIVE_SEARCH_ROUNDS = 6
const MAX_ITERATIVE_QUERIES_PER_ROUND = 8
const DEFAULT_ITERATIVE_CANDIDATE_LIMIT = 40
const ITERATIVE_LEXICAL_RELATIVE_FLOOR = 0.15
const ITERATIVE_SEMANTIC_RELATIVE_FLOOR = 0.35
const DEFAULT_GRAPH_DEPTH = 1
const MAX_GRAPH_DEPTH = 3
const DEFAULT_GRAPH_NODE_LIMIT = 50
const MAX_GRAPH_NODE_LIMIT = 200
const MAX_GRAPH_EDGE_LIMIT = 500
const DEFAULT_PATH_DEPTH = 4
const MAX_PATH_DEPTH = 6
const DEFAULT_PATH_LIMIT = 3
const MAX_PATH_LIMIT = 20
const DEFAULT_PATH_NODE_LIMIT = 200
const MAX_PATH_NODE_LIMIT = 1_000
const DEFAULT_PATH_EDGE_LIMIT = 2_000
const MAX_PATH_EDGE_LIMIT = 10_000
const DEFAULT_STATS_TOP = 20
const MAX_STATS_TOP = 100

export async function executeSearchTool(
  tool: string,
  args: ToolArgs,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  const markdownFiles = (folder?: string | null): TFile[] => {
    const normalizedFolder = folder ? normalizePath(folder) : null
    return ctx.app.vault
      .getMarkdownFiles()
      .filter((file) =>
        normalizedFolder
          ? normalizePath(file.path).startsWith(`${normalizedFolder}/`)
          : true,
      )
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  const priorityFolder = (): string =>
    normalizePath(ctx.getPriorityFolder().trim()).replace(/\/$/, '')

  const isPriorityPath = (path: string): boolean => {
    const folder = priorityFolder()
    return folder.length > 0 && normalizePath(path).startsWith(`${folder}/`)
  }

  switch (tool) {
    case 'search_vault': {
      const query = str(args, 'query')
      const keywords = Array.isArray(args.keywords)
        ? (args.keywords as unknown[]).map(String).filter(Boolean)
        : query
          ? [query]
          : []
      if (keywords.length === 0)
        return {
          kind: 'error',
          message: 'search_vault requires "query" or "keywords".',
        }

      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : DEFAULT_CANDIDATE_LIMIT
      const queryText = keywords.join(' ')
      const { countFact, folder } = await literalSearchFact(
        ctx.app,
        keywords,
        query,
        Array.isArray(args.keywords),
        str(args, 'folder'),
      )
      const results = await searchVaultWithBm25(ctx.app, queryText, {
        maxResults: MAX_SEARCH_VAULT_RESULTS,
      })
      if (results.length === 0) {
        return {
          kind: 'read',
          text: L({
            ko: `${countFact}.\n(검색어 "${queryText}"의 BM25 후보에 해당하는 노트가 없습니다)\n${literalSearchGuidance()}`,
            en: `${countFact}.\n(No notes are BM25 candidates for "${queryText}")\n${literalSearchGuidance()}`,
          }),
        }
      }
      const rows = await Promise.all(
        results.slice(0, limit).map(async ({ file, score, snippet }) => {
          const meta = await searchNoteMeta(ctx.app, file)
          const heading = meta.firstHeading
            ? `\theading="${meta.firstHeading}"`
            : ''
          const next = await sourceReadHint(file.path, ctx)
          return `${file.path}\tscore=${score.toFixed(3)}\t${meta.summary}${heading}\tnext=${next}\t${snippet}`
        }),
      )
      const limitHint =
        limit > MAX_SEARCH_VAULT_RESULTS
          ? L({
              ko: 'limit은 30까지입니다. 조건에 맞는 노트를 빠짐없이 세거나 나열하려면 query_notes를 쓰세요.',
              en: 'The limit is 30. Use query_notes to count or list all matching notes.',
            }) + '\n'
          : ''
      return {
        kind: 'read',
        text: L({
          ko: `${countFact}; 후보 ${rows.length}개 표시${folder ? ' (후보는 폴더 제한 없이 검색됨)' : ''}.\n${limitHint}키워드 검색 "${queryText}" — ${results.length}개 후보(색인된 후보 안에서 정확한 파일명/경로 일치 우선, 나머지는 관련도 순). 파일 이름으로 색인과 무관하게 위치를 찾을 수 있습니다. 표시된 경로를 그대로 사용하세요. 점수가 낮은 하위 항목은 무관할 수 있으니 근거로 쓰기 전 확인하세요.\n${literalSearchGuidance()}\n${rows.join('\n')}`,
          en: `${countFact}; showing ${rows.length} candidates${folder ? ' (candidates searched without a folder restriction)' : ''}.\n${limitHint}Keyword search "${queryText}" — ${results.length} candidates (exact file name/path matches first among indexed candidates; the rest by relevance). You can locate files by name independently of the index. Use the displayed paths exactly. Lower-scoring entries may be irrelevant; verify before using them as evidence.\n${literalSearchGuidance()}\n${rows.join('\n')}`,
        }),
      }
    }

    case 'obsidian_query': {
      const query = str(args, 'query')
      if (!query)
        return { kind: 'error', message: 'obsidian_query requires "query".' }
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : DEFAULT_CANDIDATE_LIMIT
      const results = await searchObsidianQuery(ctx.app, query, {
        limit: Infinity,
      })
      if (results.length === 0) {
        return {
          kind: 'read',
          text: `(Obsidian query "${query}" matched no notes)`,
        }
      }
      const rows = results.slice(0, limit).map((result, index) => {
        const line = result.line ? `\tline=${result.line}` : ''
        return `${index + 1}. ${result.file.path}\tscore=${result.score.toFixed(3)}${line}\t${result.metadata}\tnext=note_context -> note_outline/read_note_section\t${result.snippet}`
      })
      return {
        kind: 'read',
        text: [
          results.length > rows.length
            ? `Obsidian query "${query}" — showing ${rows.length} of ${results.length} matching note(s); raise limit for the rest.`
            : `Obsidian query "${query}" — ${results.length} note(s).`,
          'Suggested strategy: verify Properties hits first, expand selected notes with note_context/vault_graph for links and backlinks, then use body keyword search only as a recall pass.',
          ...rows,
        ].join('\n'),
      }
    }

    case 'dataview_query': {
      const query = str(args, 'query')?.trim()
      if (!query)
        return { kind: 'error', message: 'dataview_query requires "query".' }
      if (query.length > MAX_DATAVIEW_QUERY_CHARS)
        return {
          kind: 'error',
          message: `dataview_query query exceeds ${MAX_DATAVIEW_QUERY_CHARS} characters.`,
        }
      if (/```|^\s*dataviewjs\b/i.test(query))
        return {
          kind: 'error',
          message:
            'dataview_query accepts DQL only, without dataview/dataviewjs code fences.',
        }

      const sourceArg = str(args, 'source')
      let source: string | undefined
      if (sourceArg) {
        const sourceFile = resolveFile(sourceArg, ctx, ['md'])
        if (!sourceFile)
          return {
            kind: 'error',
            message: `Dataview source Markdown note not found: ${sourceArg}`,
          }
        source = sourceFile.path
      }

      const result = await executeDataviewQueryResult(query, ctx.app, source)
      if (!result.ok) return { kind: 'error', message: result.message }
      const bounded = boundDataviewResult(result.value, {
        maxChars: 40_000,
        maxTokens: Math.max(1_000, Math.floor(ctx.getContextBudget() * 0.25)),
      })
      return {
        kind: 'read',
        facts: bounded.truncated
          ? {
              completeness: 'partial',
              errorCode:
                bounded.text.length < Math.min(result.value.length, 40_000)
                  ? 'budget'
                  : 'limit',
            }
          : { completeness: result.value ? 'complete' : 'empty' },
        text: [
          '[Dataview Query]',
          query,
          '',
          `[Result truncated=${String(bounded.truncated)}]`,
          'Completeness describes returned query text only, not coverage of the vault or unindexed sources.',
          bounded.text || '(No results)',
        ].join('\n'),
      }
    }

    case 'context_candidates': {
      const query = str(args, 'query')
      if (!query)
        return {
          kind: 'error',
          message: 'context_candidates requires "query".',
        }
      const folder = str(args, 'folder')
      const normalizedFolder = folder ? normalizePath(folder) : null
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : DEFAULT_CANDIDATE_LIMIT
      const includeSemantic = args.include_semantic !== false
      const lexical: Candidate[] = (
        await searchVaultWithBm25(ctx.app, query, {
          maxResults: Math.max(limit * 2, 30),
        })
      ).map((match) => ({
        path: match.file.path,
        score: match.score,
        snippet: match.snippet,
      }))
      let semantic: Candidate[] = []
      let semanticFact: SemanticFact | undefined
      let failure: string | undefined
      if (
        includeSemantic &&
        ctx.semanticRequested?.() !== false &&
        ctx.semanticAvailability?.() !== 'lexical_only' &&
        ctx.getSemanticProvider
      ) {
        try {
          ctx.signal?.throwIfAborted()
          const provider = await ctx.getSemanticProvider()
          ctx.signal?.throwIfAborted()
          if (provider) {
            ctx.signal?.throwIfAborted()
            semantic = await semanticCandidates(provider, query, (outcome) => {
              if (outcome === 'not_ready')
                semanticFact = semanticAvailabilityFact(ctx)
              else if (outcome !== 'vector') semanticFact = outcome
            })
            ctx.signal?.throwIfAborted()
          } else semanticFact = semanticAvailabilityFact(ctx)
        } catch (error) {
          ctx.signal?.throwIfAborted()
          if (error instanceof Error && error.name === 'AbortError') throw error
          const summary = (
            error instanceof Error ? error.message : String(error)
          )
            .replace(/[\r\n\t]/g, ' ')
            .slice(0, 120)
          failure = L({
            ko: `의미 검색 실패(${summary}) — 키워드 후보만 표시합니다.`,
            en: `Semantic search failed (${summary}) — showing keyword candidates only.`,
          })
        }
      }
      const candidates = rankContextCandidates(
        lexical,
        semantic,
        normalizedFolder,
        limit,
      )
      const displayScore = (score: number) =>
        Number.isFinite(score) ? score.toFixed(3) : 'n/a'
      const rows = await Promise.all(
        candidates.map(
          async ({ selected: candidate, bm25Hit, semanticHit }, index) => {
            const file = resolveFile(candidate.path, ctx, [])
            const meta = file ? await searchNoteMeta(ctx.app, file) : null
            const metaText =
              meta?.summary ?? 'size=unknown\tlines=unknown\ttokens=unknown'
            const heading = meta?.firstHeading
              ? `\theading="${meta.firstHeading}"`
              : ''
            const next = `next=${await sourceReadHint(candidate.path, ctx)}`
            const sources =
              bm25Hit && semanticHit
                ? 'bm25+semantic'
                : bm25Hit
                  ? 'bm25'
                  : 'semantic'
            const scores = `${bm25Hit ? `\tbm25=${displayScore(bm25Hit.score)}` : ''}${semanticHit ? `\tsemantic=${displayScore(semanticHit.score)}` : ''}`
            return `${index + 1}. ${candidate.path}\trank=${index + 1}\tsources=${sources}${scores}\t${metaText}${heading}\t${next}\tsnippet=${candidate.snippet}`
          },
        ),
      )
      return {
        kind: 'read',
        text:
          candidates.length > 0
            ? [
                L({
                  ko: `컨텍스트 후보 "${query}"${folder ? ` (folder=${folder})` : ''} — ${candidates.length}개.`,
                  en: `Context candidates "${query}"${folder ? ` (folder=${folder})` : ''} — ${candidates.length}.`,
                }),
                L({
                  ko: '순위·출처·메타데이터를 보고 필요한 파일만 선택하세요. 큰 파일은 note_outline로 구조를 본 뒤 read_note_section/read_note_lines로 필요한 조각만 읽으세요.',
                  en: 'Select only the files you need by checking rank, sources and metadata. For large files, inspect the structure with note_outline, then read only the needed portions with read_note_section/read_note_lines.',
                }),
                ...(failure ? [failure] : []),
                ...semanticResultFact(
                  !failure && semantic.length === 0 ? semanticFact : undefined,
                  'context',
                ),
                ...rows,
              ].join('\n')
            : [
                L({
                  ko: `(후보가 없습니다: "${query}"${folder ? ` under ${folder}` : ''})`,
                  en: `(No candidates: "${query}"${folder ? ` under ${folder}` : ''})`,
                }),
                ...(failure ? [failure] : []),
                ...semanticResultFact(
                  !failure && semantic.length === 0 ? semanticFact : undefined,
                  'context',
                ),
              ].join('\n'),
      }
    }

    case 'iterative_search': {
      const query = str(args, 'query')
      if (!query)
        return { kind: 'error', message: 'iterative_search requires "query".' }
      const rounds = Math.min(
        Math.max(
          typeof args.rounds === 'number'
            ? Math.floor(args.rounds)
            : DEFAULT_ITERATIVE_SEARCH_ROUNDS,
          1,
        ),
        MAX_ITERATIVE_SEARCH_ROUNDS,
      )
      const perRound = Math.min(
        Math.max(
          typeof args.per_round === 'number' ? Math.floor(args.per_round) : 12,
          2,
        ),
        20,
      )
      const limit = Math.min(
        Math.max(
          typeof args.limit === 'number'
            ? Math.floor(args.limit)
            : DEFAULT_ITERATIVE_CANDIDATE_LIMIT,
          3,
        ),
        80,
      )
      const includeSemantic = args.include_semantic !== false
      const retrievalLimitPerQuery = Math.min(
        limit,
        Math.max(perRound * 3, DEFAULT_ITERATIVE_CANDIDATE_LIMIT),
      )
      const files = listedFiles(ctx)
      const filesByPath = new Map(
        files.map((file) => [normalizePath(file.path), file]),
      )
      const resolvedLinks: ResolvedLinks =
        ctx.app.metadataCache?.resolvedLinks ?? {}
      let provider: SemanticSearchProvider | null = null
      let semanticWarning: string | null = null
      let semanticFact: SemanticFact | undefined
      if (
        includeSemantic &&
        ctx.semanticRequested?.() !== false &&
        ctx.semanticAvailability?.() !== 'lexical_only' &&
        ctx.getSemanticProvider
      ) {
        try {
          provider = await ctx.getSemanticProvider()
          if (!provider) semanticFact = semanticAvailabilityFact(ctx)
        } catch (error) {
          semanticWarning =
            error instanceof Error ? error.message : String(error)
        }
      }

      type Candidate = {
        path: string
        score: number
        round: number
        sources: Set<'bm25' | 'semantic' | 'link' | 'backlink'>
        clues: Set<string>
      }
      const candidates = new Map<string, Candidate>()
      const expanded = new Set<string>()
      const searchedQueries = new Set<string>()
      const queryTrace: string[] = []
      const remember = (
        path: string,
        source: 'bm25' | 'semantic' | 'link' | 'backlink',
        score: number,
        round: number,
        clue?: string,
      ): void => {
        const file = filesByPath.get(normalizePath(path))
        if (
          !file ||
          ((source === 'link' || source === 'backlink') &&
            file.extension !== 'md')
        )
          return
        const key = normalizePath(file.path)
        const candidate = candidates.get(key) ?? {
          path: file.path,
          score: 0,
          round,
          sources: new Set(),
          clues: new Set(),
        }
        candidate.score += score
        candidate.round = Math.min(candidate.round, round)
        candidate.sources.add(source)
        if (clue) candidate.clues.add(clue)
        candidates.set(key, candidate)
      }
      const iterativeClues = createIterativeClues(ctx.app)
      const clueSeedTokens = new Set(
        tokenize(query).filter((token) => [...token].length >= 2),
      )
      const cleanClue = (value: string) => cleanIterativeClue(value, query)

      const seedTokens = query
        .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
      const seedPairs = seedTokens
        .slice(0, -1)
        .map((token, index) => `${token} ${seedTokens[index + 1]}`)
      let pendingQueries = [query, ...seedPairs, ...seedTokens]
      for (let round = 1; round <= rounds; round += 1) {
        const roundQueries = [...new Set(pendingQueries)]
          .filter((item) => !searchedQueries.has(item.toLowerCase()))
          .slice(0, MAX_ITERATIVE_QUERIES_PER_ROUND)
        if (roundQueries.length === 0 && round > 1) break

        for (const roundQuery of roundQueries) {
          searchedQueries.add(roundQuery.toLowerCase())
          queryTrace.push(`R${round}:${roundQuery}`)
          const lexical = applyRelativeFloor(
            await searchVaultWithBm25(ctx.app, roundQuery, {
              maxResults: retrievalLimitPerQuery,
            }),
            (match) => match.score,
            ITERATIVE_LEXICAL_RELATIVE_FLOOR,
          ).slice(0, retrievalLimitPerQuery)
          lexical.forEach((match, index) =>
            remember(
              match.file.path,
              'bm25',
              1 / (index + 1),
              round,
              roundQuery,
            ),
          )
          if (provider) {
            try {
              const semantic = applyRelativeFloor(
                (
                  await semanticCandidates(provider, roundQuery, (outcome) => {
                    if (!semanticFact && outcome === 'not_ready')
                      semanticFact = semanticAvailabilityFact(ctx)
                    else if (
                      !semanticFact &&
                      outcome !== 'vector' &&
                      outcome !== 'not_ready'
                    )
                      semanticFact = outcome
                  })
                ).sort((a, b) => b.score - a.score),
                (match) => match.score,
                ITERATIVE_SEMANTIC_RELATIVE_FLOOR,
              ).slice(0, retrievalLimitPerQuery)
              semantic.forEach((match, index) =>
                remember(
                  match.path,
                  'semantic',
                  0.65 / (index + 1),
                  round,
                  roundQuery,
                ),
              )
            } catch (error) {
              semanticWarning =
                error instanceof Error ? error.message : String(error)
              provider = null
            }
          }
        }

        const frontier = [...candidates.values()]
          .filter((candidate) => !expanded.has(normalizePath(candidate.path)))
          .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
          .slice(0, perRound)
        const clueGroups: string[][] = []
        for (const candidate of frontier) {
          const normalized = normalizePath(candidate.path)
          expanded.add(normalized)
          const file = filesByPath.get(normalized)
          if (!file || file.extension !== 'md') continue
          const structuralClues = [
            ...iterativeClues.collect(file, clueSeedTokens),
            file.basename,
            ...headingOutline(ctx.app, file)
              .slice(0, 4)
              .map((heading) => heading.heading),
          ]
          const candidateClues: string[] = []
          structuralClues.forEach((raw) => {
            const clue = cleanClue(raw)
            if (clue) candidateClues.push(clue)
          })
          const allOutgoing = outgoingLinks(resolvedLinks, file.path)
          const allIncoming = backlinks(resolvedLinks, file.path)
          const expandGraph =
            allOutgoing.length + allIncoming.length <=
            MAX_GRAPH_EXPANSION_DEGREE
          const outgoing = expandGraph ? allOutgoing.slice(0, perRound) : []
          const incoming = expandGraph ? allIncoming.slice(0, perRound) : []
          outgoing.forEach((ref, index) => {
            remember(ref.path, 'link', 0.12 / (index + 1), round, file.path)
            const clue = cleanClue(ref.path.split('/').at(-1) ?? ref.path)
            if (clue) candidateClues.push(clue)
          })
          incoming.forEach((ref, index) => {
            remember(ref.path, 'backlink', 0.12 / (index + 1), round, file.path)
            const clue = cleanClue(ref.path.split('/').at(-1) ?? ref.path)
            if (clue) candidateClues.push(clue)
          })
          clueGroups.push([...new Set(candidateClues)])
        }

        const diverseClues: string[] = []
        const maxGroupSize = Math.max(
          0,
          ...clueGroups.map((group) => group.length),
        )
        for (let clueIndex = 0; clueIndex < maxGroupSize; clueIndex += 1) {
          for (const group of clueGroups) {
            const clue = group[clueIndex]
            if (clue) diverseClues.push(clue)
          }
        }
        pendingQueries = [...new Set(diverseClues)]
          .filter((clue) => !searchedQueries.has(clue.toLowerCase()))
          .slice(0, MAX_ITERATIVE_QUERIES_PER_ROUND)
      }

      const retrievalSourceCount = (candidate: Candidate): number =>
        Number(candidate.sources.has('bm25')) +
        Number(candidate.sources.has('semantic'))
      const ranked = [...candidates.values()]
        .sort(
          (a, b) =>
            retrievalSourceCount(b) - retrievalSourceCount(a) ||
            b.score - a.score ||
            a.path.localeCompare(b.path),
        )
        .slice(0, limit)
      const factLine = semanticResultFact(
        !semanticWarning &&
          ![...candidates.values()].some((candidate) =>
            candidate.sources.has('semantic'),
          )
          ? semanticFact
          : undefined,
        'iterative',
      )
      if (ranked.length === 0)
        return {
          kind: 'read',
          text: [
            L({
              ko: `(반복 검색 후보가 없습니다: "${query}")`,
              en: `(No iterative search candidates: "${query}")`,
            }),
            ...factLine,
          ].join('\n'),
        }
      const rows = await Promise.all(
        ranked.map(
          async (candidate, index) =>
            `${index + 1}. ${candidate.path}\tsources=${[...candidate.sources].join('+')}\tscore=${candidate.score.toFixed(3)}\tdiscovered_round=${candidate.round}\tvia=${[...candidate.clues].slice(0, 3).join(' | ')}\tnext=${await sourceReadHint(candidate.path, ctx)}`,
        ),
      )
      return {
        kind: 'read',
        text: [
          L({
            ko: `반복 검색 "${query}" — 최대 ${rounds}라운드, ${ranked.length}개 후보.`,
            en: `Iterative search "${query}" — up to ${rounds} rounds, ${ranked.length} candidates.`,
          }),
          L({
            ko: `검색 추적: ${queryTrace.join(' -> ')}`,
            en: `Search trace: ${queryTrace.join(' -> ')}`,
          }),
          iterativeClues.summary(),
          ...factLine,
          ...(semanticWarning
            ? [
                L({
                  ko: `semantic 검색은 사용할 수 없어 BM25+링크 탐색으로 계속했습니다: ${semanticWarning}`,
                  en: `Semantic search was unavailable; continued with BM25 and link exploration: ${semanticWarning}`,
                }),
              ]
            : []),
          L({
            ko: 'BM25·semantic 후보를 합치고 상위 후보의 링크·백링크·제목·별칭·태그·heading 단서로 재검색했습니다. 후보는 근거가 아니므로 관련 원문을 직접 읽어 확인하세요.',
            en: 'Combined BM25 and semantic candidates and searched again using links, backlinks, titles, aliases, tags and heading clues from the top candidates. Candidates are not evidence; read the relevant sources directly to verify them.',
          }),
          ...rows,
        ].join('\n'),
      }
    }

    case 'folder_tree':
      return executeFileListing(tool, args, ctx)

    case 'list_all_notes': {
      const folder = str(args, 'folder')
      const limit =
        typeof args.limit === 'number' && args.limit > 0
          ? Math.floor(args.limit)
          : 500
      const files = markdownFiles(folder)
      const prioritized = [
        ...files.filter((file) => isPriorityPath(file.path)),
        ...files.filter((file) => !isPriorityPath(file.path)),
      ]
      const formatFile = (file: TFile): string => {
        const folderPath = file.path.includes('/')
          ? file.path.slice(0, file.path.lastIndexOf('/'))
          : '(root)'
        const size = file.stat?.size ? `\tsize=${file.stat.size}` : ''
        const mtime = file.stat?.mtime
          ? `\tmtime=${new Date(file.stat.mtime).toISOString()}`
          : ''
        return `${file.path}\tfolder=${folderPath}\tname=${file.basename}${size}${mtime}`
      }
      const selected = prioritized.slice(0, limit)
      const priorityLines = selected
        .filter((f) => isPriorityPath(f.path))
        .map(formatFile)
      const otherLines = selected
        .filter((f) => !isPriorityPath(f.path))
        .map(formatFile)
      const sections: string[] = []
      if (priorityLines.length > 0)
        sections.push(
          L({
            ko: `## 우선 참고 위키 — ${priorityFolder()}\n현재 작업과 관련되면 아래 요약 위키를 다른 노트보다 먼저 검토하세요.\n${priorityLines.join('\n')}`,
            en: `## Priority reference wiki — ${priorityFolder()}\nIf relevant to the current task, review the summary wiki below before other notes.\n${priorityLines.join('\n')}`,
          }),
        )
      if (otherLines.length > 0)
        sections.push(
          L({
            ko: `${priorityLines.length > 0 ? '## 기타 노트\n' : ''}${otherLines.join('\n')}`,
            en: `${priorityLines.length > 0 ? '## Other notes\n' : ''}${otherLines.join('\n')}`,
          }),
        )
      const omitted =
        files.length > limit
          ? `\n... omitted ${files.length - limit} note(s)`
          : ''
      return {
        kind: 'read',
        text:
          sections.length > 0
            ? `${sections.join('\n\n')}${omitted}`
            : '(no notes)',
      }
    }

    case 'vault_graph': {
      const sourcePath = str(args, 'path')
      const depth = boundedPositiveInteger(
        args,
        'depth',
        DEFAULT_GRAPH_DEPTH,
        MAX_GRAPH_DEPTH,
      )
      const limit = boundedPositiveInteger(
        args,
        'limit',
        200,
        MAX_GRAPH_EDGE_LIMIT,
      )
      if (depth === null || limit === null)
        return {
          kind: 'error',
          message: 'vault_graph depth and limit must be positive integers.',
        }
      const direction =
        str(args, 'direction') === 'in'
          ? 'in'
          : str(args, 'direction') === 'both'
            ? 'both'
            : 'out'
      const includeUnresolved = args.unresolved === true
      const resolvedLinks: ResolvedLinks =
        ctx.app.metadataCache?.resolvedLinks ?? {}
      const unresolvedLinks: ResolvedLinks =
        ctx.app.metadataCache?.unresolvedLinks ?? {}
      const known = new Set(
        ctx.app.vault.getMarkdownFiles().map((file) => file.path),
      )

      if (depth > 1 && !sourcePath)
        return {
          kind: 'error',
          message:
            'vault_graph depth > 1 requires a source "path"; refusing an unbounded whole-vault traversal.',
        }

      const normalizedSource = sourcePath ? normalizePath(sourcePath) : ''
      if (sourcePath && !known.has(normalizedSource))
        return { kind: 'error', message: `File not found: ${sourcePath}` }

      const edges: string[] = []
      let total = 0
      const pushEdge = (line: string): void => {
        total += 1
        if (edges.length < limit) edges.push(line)
      }

      if (depth === 1 || !sourcePath) {
        if (sourcePath) {
          if (direction === 'out' || direction === 'both')
            outgoingLinks(resolvedLinks, normalizedSource).forEach(
              ({ path, count }) => {
                if (known.has(path))
                  pushEdge(`${normalizedSource} -> ${path}\tcount=${count}`)
              },
            )
          if (direction === 'in' || direction === 'both')
            backlinks(resolvedLinks, normalizedSource).forEach(
              ({ path, count }) =>
                pushEdge(
                  `${path} -> ${normalizedSource}\tcount=${count}\t(backlink)`,
                ),
            )
          if (includeUnresolved)
            unresolvedFor(unresolvedLinks, normalizedSource).forEach(
              ({ path, count }) =>
                pushEdge(
                  `${normalizedSource} -> ${path}\tcount=${count}\t(unresolved)`,
                ),
            )
        } else {
          for (const source of Object.keys(resolvedLinks).sort()) {
            for (const [target, count] of Object.entries(
              resolvedLinks[source],
            )) {
              if (known.has(target))
                pushEdge(`${source} -> ${target}\tcount=${count}`)
            }
          }
          if (includeUnresolved) {
            for (const source of Object.keys(unresolvedLinks).sort()) {
              for (const [target, count] of Object.entries(
                unresolvedLinks[source],
              ))
                pushEdge(`${source} -> ${target}\tcount=${count}\t(unresolved)`)
            }
          }
        }
        const omitted =
          total > edges.length
            ? `\n... omitted ${total - edges.length} edge(s)`
            : ''
        return {
          kind: 'read',
          text:
            edges.length > 0 ? `${edges.join('\n')}${omitted}` : '(no links)',
        }
      }

      const maxNodes = boundedPositiveInteger(
        args,
        'max_nodes',
        DEFAULT_GRAPH_NODE_LIMIT,
        MAX_GRAPH_NODE_LIMIT,
      )
      if (maxNodes === null)
        return {
          kind: 'error',
          message: 'vault_graph max_nodes must be a positive integer.',
        }
      type QueueItem = { path: string; depth: number }
      const queue: QueueItem[] = [{ path: normalizedSource, depth: 0 }]
      const visited = new Set([normalizedSource])
      const edgeKeys = new Set<string>()
      let truncated = false
      const addTraversalEdge = (
        from: string,
        to: string,
        count: number,
        edgeDepth: number,
        suffix = '',
      ): void => {
        const key = `${from}\u0000${to}\u0000${edgeDepth}\u0000${suffix}`
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        pushEdge(
          `${from} -> ${to}\tcount=${count}\tdepth=${edgeDepth}${suffix}`,
        )
      }

      while (queue.length > 0) {
        const current = queue.shift()!
        if (current.depth >= depth) continue
        const nextDepth = current.depth + 1
        const neighbours: {
          path: string
          count: number
          suffix: string
        }[] = []
        if (direction === 'out' || direction === 'both') {
          for (const { path, count } of outgoingLinks(
            resolvedLinks,
            current.path,
          )) {
            if (known.has(path)) neighbours.push({ path, count, suffix: '' })
            else if (includeUnresolved)
              addTraversalEdge(
                current.path,
                path,
                count,
                nextDepth,
                '\t(unresolved)',
              )
          }
        }
        if (direction === 'in' || direction === 'both') {
          for (const { path, count } of backlinks(resolvedLinks, current.path))
            neighbours.push({ path, count, suffix: '\t(backlink)' })
        }

        for (const neighbour of neighbours) {
          const isBacklink = neighbour.suffix.includes('backlink')
          addTraversalEdge(
            isBacklink ? neighbour.path : current.path,
            isBacklink ? current.path : neighbour.path,
            neighbour.count,
            nextDepth,
            neighbour.suffix,
          )
          if (visited.has(neighbour.path)) continue
          if (visited.size >= maxNodes) {
            truncated = true
            continue
          }
          visited.add(neighbour.path)
          queue.push({ path: neighbour.path, depth: nextDepth })
        }
      }
      if (total > edges.length || queue.length > 0) truncated = true
      return {
        kind: 'read',
        text: boundedGraphText(
          edges,
          `truncated=${String(truncated)}\tvisited_nodes=${visited.size}\tdepth=${depth}`,
        ),
      }
    }

    case 'graph_path': {
      const fromArg = str(args, 'from')
      const toArg = str(args, 'to')
      if (!fromArg || !toArg)
        return {
          kind: 'error',
          message: 'graph_path requires "from" and "to".',
        }
      const maxDepth = boundedPositiveInteger(
        args,
        'max_depth',
        DEFAULT_PATH_DEPTH,
        MAX_PATH_DEPTH,
      )
      const maxPaths = boundedPositiveInteger(
        args,
        'max_paths',
        DEFAULT_PATH_LIMIT,
        MAX_PATH_LIMIT,
      )
      const maxNodes = boundedPositiveInteger(
        args,
        'max_nodes',
        DEFAULT_PATH_NODE_LIMIT,
        MAX_PATH_NODE_LIMIT,
      )
      const maxEdges = boundedPositiveInteger(
        args,
        'max_edges',
        DEFAULT_PATH_EDGE_LIMIT,
        MAX_PATH_EDGE_LIMIT,
      )
      if (
        maxDepth === null ||
        maxPaths === null ||
        maxNodes === null ||
        maxEdges === null
      )
        return {
          kind: 'error',
          message: 'graph_path limits must be positive integers.',
        }

      const resolveEndpoint = (
        value: string,
      ): { path: string } | { error: string } => {
        const normalized = normalizePath(value.trim())
        const withoutExtension = normalized.replace(/\.md$/i, '')
        const exact = markdownFiles().filter(
          (file) =>
            file.path === normalized ||
            file.path.replace(/\.md$/i, '') === withoutExtension,
        )
        if (exact.length === 1) return { path: exact[0].path }
        if (exact.length > 1)
          return {
            error: `Ambiguous graph endpoint "${value}". Candidates: ${exact
              .map((file) => file.path)
              .join(', ')}`,
          }
        const basename = withoutExtension.split('/').pop()?.toLowerCase() ?? ''
        const candidates = markdownFiles().filter(
          (file) => file.basename.toLowerCase() === basename,
        )
        if (candidates.length === 1) return { path: candidates[0].path }
        if (candidates.length > 1)
          return {
            error: `Ambiguous graph endpoint "${value}". Candidates: ${candidates
              .map((file) => file.path)
              .join(', ')}`,
          }
        return { error: `Graph endpoint not found: ${value}` }
      }

      const from = resolveEndpoint(fromArg)
      const to = resolveEndpoint(toArg)
      if ('error' in from) return { kind: 'error', message: from.error }
      if ('error' in to) return { kind: 'error', message: to.error }

      const resolvedLinks: ResolvedLinks =
        ctx.app.metadataCache?.resolvedLinks ?? {}
      const adjacency = new Map<
        string,
        Map<string, Set<'forward' | 'backward'>>
      >()
      const addAdjacency = (
        source: string,
        target: string,
        direction: 'forward' | 'backward',
      ): void => {
        const byTarget =
          adjacency.get(source) ??
          new Map<string, Set<'forward' | 'backward'>>()
        const directions =
          byTarget.get(target) ?? new Set<'forward' | 'backward'>()
        directions.add(direction)
        byTarget.set(target, directions)
        adjacency.set(source, byTarget)
      }
      const known = new Set(markdownFiles().map((file) => file.path))
      for (const [source, targets] of Object.entries(resolvedLinks)) {
        if (!known.has(source)) continue
        for (const target of Object.keys(targets)) {
          if (!known.has(target)) continue
          addAdjacency(source, target, 'forward')
          addAdjacency(target, source, 'backward')
        }
      }

      type PathState = {
        node: string
        nodes: string[]
        directions: string[]
      }
      const queue: PathState[] = [
        { node: from.path, nodes: [from.path], directions: [] },
      ]
      const searchedNodes = new Set([from.path])
      const paths: { nodes: string[]; directions: string[] }[] = []
      let searchedEdges = 0
      let truncated = false
      let foundDepth: number | null = null

      while (queue.length > 0) {
        const state = queue.shift()!
        if (state.node === to.path) {
          const currentDepth = state.nodes.length - 1
          if (foundDepth !== null && currentDepth > foundDepth) continue
          foundDepth ??= currentDepth
          paths.push({ nodes: state.nodes, directions: state.directions })
          if (paths.length >= maxPaths && queue.length > 0) {
            truncated = true
            break
          }
          continue
        }
        const currentDepth = state.nodes.length - 1
        if (foundDepth !== null && currentDepth >= foundDepth) continue
        if (currentDepth >= maxDepth) {
          if ((adjacency.get(state.node)?.size ?? 0) > 0) truncated = true
          continue
        }
        const next = [...(adjacency.get(state.node)?.entries() ?? [])].sort(
          ([a], [b]) => a.localeCompare(b),
        )
        for (const [node, directionSet] of next) {
          searchedEdges += 1
          if (searchedEdges > maxEdges) {
            truncated = true
            break
          }
          if (state.nodes.includes(node)) continue
          if (!searchedNodes.has(node)) {
            if (searchedNodes.size >= maxNodes) {
              truncated = true
              continue
            }
            searchedNodes.add(node)
          }
          if (foundDepth !== null && currentDepth + 1 > foundDepth) continue
          const direction =
            directionSet.size === 2
              ? 'both'
              : directionSet.has('forward')
                ? 'forward'
                : 'backward'
          queue.push({
            node,
            nodes: [...state.nodes, node],
            directions: [...state.directions, direction],
          })
        }
        if (truncated && searchedEdges >= maxEdges) break
      }

      const payload = {
        paths,
        searched_nodes: searchedNodes.size,
        searched_edges: searchedEdges,
        found: paths.length > 0,
        truncated,
      }
      return { kind: 'read', text: JSON.stringify(payload) }
    }

    case 'graph_stats': {
      const scopeArg = str(args, 'scope')
      const top = boundedPositiveInteger(
        args,
        'top',
        DEFAULT_STATS_TOP,
        MAX_STATS_TOP,
      )
      if (top === null)
        return {
          kind: 'error',
          message: 'graph_stats top must be a positive integer.',
        }
      const scope = scopeArg
        ? normalizePath(scopeArg.trim()).replace(/\/$/, '')
        : ''
      const inScope = (path: string): boolean =>
        !scope || path === scope || path.startsWith(`${scope}/`)
      const files = markdownFiles().filter(
        (file) =>
          file.path !== '.verbex' &&
          !file.path.startsWith('.verbex/') &&
          inScope(file.path),
      )
      const tagsByPath = new Map(
        files.map((file) => [file.path, noteTags(ctx.app, file)]),
      )
      const stats = buildGraphStats(
        files.map((file) => file.path),
        ctx.app.metadataCache?.resolvedLinks ?? {},
        tagsByPath,
        top,
      )
      return { kind: 'read', text: JSON.stringify(stats) }
    }

    case 'note_context':
      return executeNoteContext(args, ctx)

    default:
      return { kind: 'error', message: `Unknown search tool: ${tool}` }
  }
}
