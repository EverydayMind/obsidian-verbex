import {
  DELETE_FILE_ROUTE,
  MOVE_FILE_ROUTE,
  RENAME_FILE_ROUTE,
} from './fileOperationRoutes'

export const ENGLISH_FORMAT_REUSE =
  /^(?=[\s\S]*\b(?:hwpx?|hangul|reports?)\b)(?=[\s\S]*\b(?:format|formatting|style|template)\b)(?=[\s\S]*\b(?:sample|example|reference|existing|reuse|match|like|follow|same)\b)/i
/** English request grammar. Kept separate so the Korean input rules stay stable. */
export const ENGLISH_TOOL_ROUTES: { pattern: RegExp; names: string[] }[] = [
  {
    pattern: ENGLISH_FORMAT_REUSE,
    names: [
      'prepare_format_reuse',
      'save_format_decomposition',
      'produce_format_reuse',
    ],
  },
  {
    pattern:
      /\b(?:(?:dead|missing|broken|unresolved) links?|links? (?:(?:that )?(?:point|pointing|lead|leading) )?to (?:notes?|files?) (?:that |which )?(?:do not|don't|does not|doesn't) exist|non[- ]existent (?:notes?|files?)|no (?:incoming )?links? pointing to|no (?:incoming links|backlinks)|not linked from anywhere|unlinked notes?|orphans?|orphan(?:ed)? notes?|check (?:the )?links?|link (?:check|audit))\b/i,
    names: ['audit_links'],
  },
  {
    pattern:
      /\b(?:how many (?!days\b)|count|sort(?:ed)?|oldest|newest|number of|(?:per|by) (?:month|year|week|folder|kind|type|status|owner|org)|most|fewest|least|latest|earliest|top \d+|bottom \d+|ascending|descending|order(?:ed)? by|group(?:ed)? by)\b|\b(?:between|from|since|after|before)\s+(?:\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|\d{1,2}\/\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2})\b/i,
    names: ['query_notes'],
  },
  {
    pattern:
      /\b(?:to-?dos?|unchecked|action items?|checkbox(?:es)?|(?:open|unfinished|incomplete|outstanding|pending|remaining) (?:items?|tasks?|actions?)|not yet (?:done|checked))\b/i,
    names: ['list_tasks', 'query_notes'],
  },
  {
    pattern:
      /\b(?:how many days|D-?day|business days?|weekday|days? (?:left|remaining|until)|what day(?: of the week)?|day of the week|working days?|weekdays|in \d+ days?|\d+ days? (?:from|after|before|ago))\b/i,
    names: ['date_calc'],
  },
  {
    pattern:
      /\b(?:calculate|average|percent(?:age)?|ratio|sum|total|cumulative|mean|share|growth(?: rate)?|decline(?: rate)?|year-over-year|compute)\b|\d\s*%/i,
    names: ['calculate'],
  },
  {
    pattern:
      /\b(?:undo|revert|rollback|roll back|put it back|(?:cancel|discard) (?:the )?(?:last|latest|recent) (?:change|edit)|restore)\b/i,
    names: ['restore_last_change'],
  },
  {
    pattern:
      /\b(?:list all|inventory|list of|(?:all|every) (?:notes?|files?|items?)|full list|enumerate)\b/i,
    names: [
      'find_by_property',
      'export_property_query',
      'list_files',
      'render_base',
    ],
  },
  {
    pattern:
      /\b(?:(?:(?:whose|with|where)\s+)?(?:type|kind|status|category|org|owner)\s*(?:is\b|=|:)\s*\S+|category|status|unfinished|incomplete)\b/i,
    names: ['find_by_property', 'render_base', 'read_frontmatter'],
  },
  {
    pattern:
      /\b(?:treaty|treaties|checklist|review[ ._-]index|agreements?|conventions?)\b/i,
    names: [
      'build_review_index',
      'checklist_next',
      'submit_finding',
      'audit_index',
      'compile_report',
    ],
  },
  {
    pattern: /\b(?:frontmatter|property|properties|metadata)\b/i,
    names: [
      'read_frontmatter',
      'find_by_property',
      'query_notes',
      'obsidian_query',
      'render_base',
    ],
  },
  {
    pattern:
      /^(?=[\s\S]*\b(?:frontmatter|property|properties|metadata)\b)(?=[\s\S]*\b(?:set|remove|update|edit|write|change|modify|add|delete|rename)\b)/i,
    names: ['update_frontmatter'],
  },
  {
    pattern:
      /\b(?:links?|backlinks?|graph\s*(?:view|path|analysis)|note\s*graph|related|relationships?|connections?)\b/i,
    names: ['note_context', 'vault_graph', 'graph_path', 'parse_links'],
  },
  {
    pattern:
      /\b(?:folders?|list files|list notes|file list|note list|directory|directories|subfolders?)\b/i,
    names: ['list_files', 'read_folder', 'folder_tree'],
  },
  {
    pattern: /\b(?:research|evidence|sources?|investigate|look into)\b/i,
    names: ['context_candidates', 'iterative_search'],
  },
  {
    pattern:
      /^(?=[\s\S]*\b(?:sections?|headings?)\b)(?=[\s\S]*\b(?:append|prepend|replace|patch|edit|update|insert|add|remove|delete|rewrite|change|modify|revise)\b)/i,
    names: ['patch_section'],
  },
  {
    pattern:
      /\b(?:currently open|(?:active|current|open) (?:note|document|file))\b/i,
    names: ['active_note'],
  },
  {
    pattern:
      /\b(?:copy|clone|template|combine|concatenate|duplicate|merge|join)\b/i,
    names: ['copy_file', 'combine_files'],
  },
  { pattern: DELETE_FILE_ROUTE, names: ['delete_file'] },
  { pattern: MOVE_FILE_ROUTE, names: ['move_file'] },
  { pattern: RENAME_FILE_ROUTE, names: ['rename_file'] },
  {
    pattern:
      /\b(?:statistics|stats|orphans?|centrality|central nodes?|co[ -]occurrence)\b/i,
    names: ['graph_stats'],
  },
  { pattern: /\btags?\b/i, names: ['list_tags', 'find_by_tag', 'query_notes'] },
  {
    pattern: /\b(?:semantic|similar|similarity)\b/i,
    names: ['semantic_search'],
  },
  {
    pattern: /\b(?:context\s*(?:tree|forest|map)|search_context_tree)\b/i,
    names: ['search_context_tree'],
  },
  {
    pattern: /\b(?:dataview|dql|bases?|render)\b|\.base\b/i,
    names: ['render_base', 'render_dataview', 'dataview_query'],
  },
  {
    pattern: /\b(?:sections?|headings?|nearby lines|surrounding lines)\b/i,
    names: ['read_note_section', 'read_note_around'],
  },
  {
    pattern: /\b(?:articles?|regex|pattern|search in (?:a |the )?file)\b/i,
    names: ['search_in_file', 'note_outline_by_pattern'],
  },
]
