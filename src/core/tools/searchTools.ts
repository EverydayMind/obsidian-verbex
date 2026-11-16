import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { RequestTool } from '../../types/llm/request'

import {
  SEARCH_CONTEXT_TREE_TOOL_REGISTRY_ENTRY,
  getSearchContextTreeToolDefinition,
} from './contextForestTool'
import { ToolRegistryEntry } from './toolDefinitions'
import { pathProp, tool } from './toolHelper'

// Partial readers also accept document projections; this note follows each
// reader's own purpose so the purpose stays the first thing the model reads.
const PROJECTION_NOTE =
  ' Also reads opted-in HWP/HWPX/PDF disk projections: line numbers are projection lines with source revision and page/block locators, and document section references use L<startLine>.'

export function getSearchToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    tool(
      'search_vault',
      'Keyword (BM25) search over vault notes, returning relevance-ranked candidate paths with score and lightweight metadata so you can decide which files or slices to read. Use it for known words, names or titles; for research where one search may miss files use iterative_search.',
      {
        query: {
          type: 'string',
          description:
            'Optional single query string. Used when keywords is omitted.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Search keyword list; takes precedence over query. Each keyword gets its own literal-match note count, while query counts the whole string as one phrase.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of candidates to return.',
        },
      },
    ),
    tool(
      'obsidian_query',
      L(
        {
          ko: 'Execute an Obsidian Search-style query over vault notes and metadata: several property filters like `[project:"무역인증 AI 서비스 확대"] [status:정리완료]`, quoted phrases, and OR between body terms such as `"해외인증" OR "기술규제" OR TradeNavi`. Use it when one key/value of find_by_property is not enough (combined properties, or properties plus body terms).',
          en: 'Execute an Obsidian Search-style query over vault notes and metadata: several property filters like `[project:"Trade certification AI service expansion"] [status:organized]`, quoted phrases, and OR between body terms such as `"overseas certification" OR "technical regulations" OR TradeNavi`. Use it when one key/value of find_by_property is not enough (combined properties, or properties plus body terms).',
        },
        locale,
      ),
      {
        query: {
          type: 'string',
          description:
            '`[key:value]` / `[key:"value"]` match a whole property value (case-insensitive; any item of a list); a shortened or partial value matches nothing, so confirm the exact value first (e.g. query_notes group_by that property). Other words and quoted phrases are substrings that must all appear, or any one of them if OR is used anywhere. No tag:, path:, file:, -exclusion or parentheses.',
        },
        limit: {
          type: 'number',
          description:
            'Maximum notes to return, default 15. The result says when more matched.',
        },
      },
      ['query'],
    ),
    tool(
      'dataview_query',
      'Execute a bounded Dataview DQL query against the current vault. Requires the Dataview plugin. Use this only for a multi-column table or computed values (e.g. the sum of a property) that query_notes cannot produce; use query_notes for counts, grouping and sorting, find_by_property or obsidian_query for simple Properties/frontmatter filters, and render_dataview for Dataview blocks already written in a note. Pass source when the query relies on this.file or relative FROM resolution; the tool never guesses an active source file. Query results are rendered as markdown and may be truncated to the current context budget.',
      {
        query: {
          type: 'string',
          description: 'Dataview DQL query without a dataview code fence.',
        },
        source: {
          type: 'string',
          description:
            'Optional vault-relative Markdown note used as the query origin for this.file and relative FROM expressions.',
        },
      },
      ['query'],
    ),
    tool(
      'context_candidates',
      'Return candidate files ranked by equally weighted fusion of local BM25 and provider rankings, with source scores, file size, line count, token estimate, heading, snippet, and suggested next read tool. Use this single-round search to size candidates before reading large files or broad folders, then pull only the necessary ranges with note_outline/read_note_lines/read_note_section. For multi-round research use iterative_search.',
      {
        query: {
          type: 'string',
          description: 'Task or search query used to rank candidates.',
        },
        folder: {
          type: 'string',
          description:
            'Optional folder path; filters the vault-wide top hits, so an empty result does not prove the folder has no match.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of candidates to return.',
        },
        include_semantic: {
          type: 'boolean',
          description:
            'Also include semantic-search candidates when the semantic provider is configured. Default true.',
        },
      },
      ['query'],
    ),
    tool(
      'iterative_search',
      'Run a bounded multi-round vault investigation. Each round fuses BM25 and configured semantic/embedding hits, expands outgoing links and backlinks from the strongest new candidates, then searches again using newly discovered titles, aliases, tags, headings, and linked-note names. Use this for research, evidence synthesis, and tasks where one search may miss files. Returned candidates still require read_file or partial-read verification.',
      {
        query: {
          type: 'string',
          description: 'Initial research question or retrieval query.',
        },
        rounds: {
          type: 'number',
          description: 'Maximum search/expansion rounds. Default 4, maximum 6.',
        },
        per_round: {
          type: 'number',
          description:
            'Maximum strongest candidates expanded per round. Default 12, maximum 20.',
        },
        limit: {
          type: 'number',
          description: 'Maximum final candidates. Default 40, maximum 80.',
        },
        include_semantic: {
          type: 'boolean',
          description:
            'Use the configured semantic/embedding provider in addition to BM25. Default true.',
        },
      },
      ['query'],
    ),
    tool(
      'folder_tree',
      'Show the folder structure: a paged inventory of visible vault files of every format with per-folder counts and file format/size. Recursive exact folder boundary, path order, default 200/max 500 files; continue using nextOffset. For a plain file list use list_files.',
      {
        offset: {
          type: 'number',
          description: 'Zero-based file offset, default 0.',
        },
        limit: {
          type: 'number',
          description: 'File page size, default 200/max 500.',
        },
        folder: { type: 'string', description: 'Optional folder path.' },
        max_depth: {
          type: 'number',
          description:
            'Optional maximum folder depth counted from the vault root (root files are 0).',
        },
      },
    ),
    tool(
      'list_all_notes',
      'List Markdown notes only, with path, folder, basename, and lightweight metadata. A configured vault summary wiki is placed in a clearly labelled first section so you can consult it before other notes when relevant. For files of every format use list_files.',
      {
        folder: { type: 'string', description: 'Optional folder path.' },
        limit: {
          type: 'number',
          description:
            'Maximum notes to return, default 500. No paging: raise it or narrow with folder. For counts use query_notes.',
        },
      },
    ),
    tool(
      'vault_graph',
      'Return the wikilink graph between markdown notes. For a single note pass "path" with "direction" to get outgoing links, backlinks (who links to it), or both. Set "unresolved" to also include links to notes that do not exist yet (content gaps). For the most-linked notes or link counts use graph_stats.',
      {
        path: {
          type: 'string',
          description:
            'Optional exact vault-relative note path including .md. When omitted, returns resolved graph edges for the whole vault.',
        },
        direction: {
          type: 'string',
          enum: ['out', 'in', 'both'],
          description:
            'For a single note: "out" = outgoing links (default), "in" = backlinks, "both" = both directions.',
        },
        unresolved: {
          type: 'boolean',
          description:
            'When true, also include links pointing to non-existent notes (unresolved links).',
        },
        depth: {
          type: 'number',
          description:
            'Optional traversal depth. Defaults to 1 and preserves the current one-hop output. Values 2-3 require path.',
        },
        max_nodes: {
          type: 'number',
          description:
            'Maximum visited nodes for depth > 1. Default 50, maximum 200.',
        },
        limit: {
          type: 'number',
          description:
            'Optional maximum number of graph edges to return. Default 200, maximum 500.',
        },
      },
    ),
    tool(
      'graph_path',
      'Find bounded shortest connection paths between two Markdown notes using forward links and backlinks. Use canonical vault-relative paths when possible; an ambiguous basename is reported with candidates instead of being resolved arbitrarily. A missing path is a normal no-path result only after both endpoint notes resolve.',
      {
        from: {
          type: 'string',
          description: 'Source Markdown path or an unambiguous basename.',
        },
        to: {
          type: 'string',
          description: 'Target Markdown path or an unambiguous basename.',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum path depth. Default 4, maximum 6.',
        },
        max_paths: {
          type: 'number',
          description:
            'Maximum shortest paths to return. Default 3, maximum 20.',
        },
        max_nodes: {
          type: 'number',
          description: 'Maximum nodes examined. Default 200, maximum 1000.',
        },
        max_edges: {
          type: 'number',
          description:
            'Maximum graph edges examined. Default 2000, maximum 10000.',
        },
      },
      ['from', 'to'],
    ),
    tool(
      'graph_stats',
      'Return bounded factual graph statistics for the vault or a folder: notes with no link in or out inside the scope, notes with the highest in+out link total, tag co-occurrence pairs, and totals. For notes with no incoming link or for broken links use audit_links.',
      {
        scope: {
          type: 'string',
          description:
            'Optional vault-relative folder path to restrict the scan.',
        },
        top: {
          type: 'number',
          description:
            'Maximum central notes and tag pairs. Default 20, maximum 100.',
        },
      },
    ),
    tool(
      'note_context',
      'Return a one-call relationship snapshot for a note: tags, aliases, outgoing links, backlinks, unresolved links, notes sharing its tags, sibling notes in the same folder, and its heading outline. Use this first when an instruction targets a specific note, to understand its neighbourhood before acting.',
      {
        path: pathProp,
      },
      ['path'],
    ),
    tool(
      'find_unlinked_mentions',
      "Find a note's UNLINKED mentions — notes related by plain-text name rather than a wikilink. Returns two lists: notes that mention this note's title/alias without linking to it, and notes whose title/alias this note mentions without linking. Use together with note_context (which covers explicit links and backlinks) to survey every related note — linked, backlinked, or merely mentioned — then read the ones the task needs.",
      {
        path: pathProp,
        limit: {
          type: 'number',
          description:
            'Maximum notes per direction, default 20. The result says when a list was cut.',
        },
      },
      ['path'],
    ),
    tool(
      'note_outline',
      'Return one bounded page of a note structure without its body: total line/char/token counts and headings with levels and 1-based line ranges. Follow next_offset until the outline is complete, then use read_note_lines / read_note_section for only the needed ranges. For non-Markdown structures such as Article 5 or 제3조, use note_outline_by_pattern.' +
        PROJECTION_NOTE,
      {
        continuation: {
          type: 'string',
          description:
            'Document projection only: opaque continuation from the previous result; keep all other arguments unchanged. Bound to revision, range and query.',
        },
        path: pathProp,
        offset: {
          type: 'number',
          description: 'Zero-based heading offset. Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Maximum headings to return. Default 80, maximum 200.',
        },
      },
      ['path'],
    ),
    tool(
      'search_in_file',
      'Search ONE note with a bounded JavaScript regular expression matched independently on each line. Returns matching lines, 1-based line numbers, heading breadcrumbs, occurrence totals, and paging hints. Use it to locate anchors in a large note before read_note_around/read_note_lines. Invalid regex syntax falls back to literal search.' +
        PROJECTION_NOTE,
      {
        continuation: {
          type: 'string',
          description:
            'Document projection only: opaque continuation from the previous result; keep all other arguments unchanged. Bound to revision, range and query.',
        },
        path: pathProp,
        pattern: {
          type: 'string',
          description:
            'Per-line JavaScript regex (Unicode; case-insensitive by default). Matches anywhere in the line, so no leading/trailing .*; two .* in one pattern, (a+)+ and (a|b)+ are rejected.',
        },
        case_sensitive: { type: 'boolean', description: 'Default false.' },
        context_lines: {
          type: 'number',
          description: 'Context lines around each hit. Default 0, maximum 5.',
        },
        max_matches: {
          type: 'number',
          description: 'Matching lines per page. Default 50, maximum 200.',
        },
        offset: {
          type: 'number',
          description: 'Zero-based matching-line offset. Default 0.',
        },
      },
      ['path', 'pattern'],
    ),
    tool(
      'note_outline_by_pattern',
      'Return a bounded section outline for a note whose sections start with lines matching a regex, such as PREAMBLE, CHAPTER ONE, Article 5, ARTICLE 12.4, or 제3장. Includes the preamble before the first match, section line ranges, token estimates, and paging hints. If the supplied pattern matches nothing, the tool automatically tries common document-level boundaries, preferring PREAMBLE/CHAPTER markers over Article markers.',
      {
        path: pathProp,
        pattern: {
          type: 'string',
          description:
            'Required. Per-line regex (case-insensitive) matched anywhere in the line; anchor it with ^ (e.g. ^제\\s*\\d+\\s*조) so in-text references do not split sections. Auto-detection runs only when your pattern matches nothing.',
        },
        offset: {
          type: 'number',
          description: 'Zero-based section offset. Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Sections per page. Default 80, maximum 200.',
        },
      },
      ['path', 'pattern'],
    ),
    tool(
      'read_note_lines',
      'Read a specific 1-based inclusive line range of a note (like `sed -n`). Use this to read only the part of a large note you need, e.g. a range reported by note_outline.' +
        PROJECTION_NOTE,
      {
        continuation: {
          type: 'string',
          description:
            'Omit on the first call (do not send null). Document projection only: opaque continuation from the previous result; keep all other arguments unchanged. Bound to revision, range and query.',
        },
        path: pathProp,
        start_line: {
          type: 'number',
          description: 'First line to read, 1-based and inclusive.',
        },
        end_line: {
          type: 'number',
          description: 'Last line to read, 1-based and inclusive.',
        },
        include_line_numbers: {
          type: 'boolean',
          description:
            'Prefix each line with its 1-based number. Default true.',
        },
      },
      ['path', 'start_line', 'end_line'],
    ),
    tool(
      'read_note_section',
      'Read the content under a specific heading. The section runs from the heading to just before the next heading of the same or higher level (nested subsections included). Returns the line range read. Use note_outline first to see headings.' +
        PROJECTION_NOTE,
      {
        continuation: {
          type: 'string',
          description:
            'Omit on the first call (do not send null). Document projection only: opaque continuation from the previous result; keep all other arguments unchanged. Bound to revision, range and query.',
        },
        path: pathProp,
        heading: {
          type: 'string',
          description:
            'Heading text to read under, matched case-insensitively, without the leading # marks.',
        },
        occurrence: {
          type: 'number',
          description:
            'Which match to use when the heading text repeats, 1-based. Default 1.',
        },
        include_subsections: {
          type: 'boolean',
          description: 'Include nested lower-level headings. Default true.',
        },
      },
      ['path', 'heading'],
    ),
    tool(
      'read_note_around',
      'Read the lines around a 1-based anchor line (context window). Use this to inspect a search hit before reading a whole section.' +
        PROJECTION_NOTE,
      {
        continuation: {
          type: 'string',
          description:
            'Omit on the first call (do not send null). Document projection only: opaque continuation from the previous result; keep all other arguments unchanged. Bound to revision, range and query.',
        },
        path: pathProp,
        line: { type: 'number', description: '1-based anchor line.' },
        before: {
          type: 'number',
          description: 'Lines before the anchor. Default 20, maximum 200.',
        },
        after: {
          type: 'number',
          description: 'Lines after the anchor. Default 20, maximum 200.',
        },
      },
      ['path', 'line'],
    ),
    tool(
      'list_tags',
      'List the vault tag taxonomy: every tag with the number of notes carrying it, most common first.',
      {
        limit: {
          type: 'number',
          description:
            'Default 100; raise it when the result reports omitted tags.',
        },
      },
    ),
    tool(
      'find_by_tag',
      'List all notes carrying a given tag (with or without the leading #). Use list_tags first when the exact tag name is unknown.',
      {
        tag: {
          type: 'string',
          description:
            'Exact tag name (case-sensitive; nested a/b is separate from a), e.g. "project" or "#project".',
        },
        limit: {
          type: 'number',
          description:
            'Default 100, no paging: when the result reports omitted notes, call again with a larger limit.',
        },
      },
      ['tag'],
    ),
    tool(
      'semantic_search',
      'Single meaning-based search with the configured embedding or hybrid provider, for wording that differs from the note text. For exact words use search_vault; for research where one search may miss files use iterative_search, which already includes semantic hits.',
      {
        query: { type: 'string', description: 'Semantic search query.' },
        limit: {
          type: 'number',
          description: 'Optional maximum number of semantic hits to return.',
        },
      },
      ['query'],
    ),
    tool(
      'request_tool',
      `Request development of a NEW tool when the available tools genuinely cannot do something the task needs. This does NOT create or run the tool now — it appends a request to the tool-request log note for a developer to review (the write may need user approval). Use it instead of silently giving up or hacking around a real capability gap; then keep working with the tools you do have. Be specific (name, purpose, why existing tools fall short, a concrete example) so the tool can actually be built. Do not request a tool whose job an existing tool already covers.`,
      {
        name: {
          type: 'string',
          description:
            'Proposed tool name in snake_case, e.g. "diff_two_notes".',
        },
        purpose: {
          type: 'string',
          description: 'The capability the tool should provide — what it does.',
        },
        why_insufficient: {
          type: 'string',
          description:
            'Why the existing tools cannot achieve this, and what you tried.',
        },
        inputs: {
          type: 'string',
          description: 'Expected inputs/arguments of the proposed tool.',
        },
        outputs: {
          type: 'string',
          description: 'Expected output / return shape of the proposed tool.',
        },
        example: {
          type: 'string',
          description: 'A concrete task where this tool would have helped.',
        },
      },
      ['name', 'purpose'],
    ),
    getSearchContextTreeToolDefinition(locale),
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const SEARCH_TOOL_DEFINITIONS = getSearchToolDefinitions()

export const SEARCH_TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  search_vault: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
    evidenceRole: 'discovery',
  },
  obsidian_query: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  dataview_query: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    evidenceRole: 'reading',
  },
  context_candidates: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  iterative_search: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    simpleCore: true,
    evidenceRole: 'discovery',
  },
  folder_tree: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  list_all_notes: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  vault_graph: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  graph_path: {
    category: 'read',
    pathArgs: ['from', 'to'],
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  graph_stats: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  note_context: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  find_unlinked_mentions: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  note_outline: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
  },
  search_in_file: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    simpleCore: true,
  },
  note_outline_by_pattern: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  read_note_lines: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
    evidenceRole: 'reading',
  },
  read_note_section: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    evidenceRole: 'reading',
  },
  read_note_around: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    evidenceRole: 'reading',
  },
  list_tags: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  find_by_tag: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  semantic_search: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  search_context_tree: SEARCH_CONTEXT_TREE_TOOL_REGISTRY_ENTRY,
  request_tool: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
}
