import { DEFAULT_EXPORT_FOLDER } from '../../constants'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { RequestTool } from '../../types/llm/request'

import { ToolRegistryEntry } from './toolDefinitions'
import { contentProp, pathProp, tool } from './toolHelper'

export function getFileToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    tool(
      'restore_last_change',
      'Restore the most recent vault note/file change applied in this conversation, after user approval. The host selects the checkpoint. Not for edits made inside an open document editor (use the undo tool of that editor). Use it to undo a change you proposed with replace_in_file/update_file/etc. after the user applied it; do not hand-write a reverse edit.',
      {
        reason: {
          type: 'string',
          description: 'Optional reason for restoring.',
        },
      },
    ),
    tool(
      'read_file',
      'Read Markdown (.md) and text vault notes. Use this for .md even when a document-import plugin does not support Markdown.',
      {
        path: pathProp,
      },
      ['path'],
    ),
    tool(
      'read_files',
      'Read multiple explicitly selected vault notes in one bounded call. Use this after broad retrieval when several candidate originals must be inspected; it packs up to 20 files within a token budget and reports missing or omitted paths.',
      {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Vault-relative file paths to read (same formats as read_file).',
        },
        max_tokens: {
          type: 'number',
          description:
            'Token budget for the packed bodies. Normally omit (the default is large); set it lower to save context, or higher within the host limit when files were omitted.',
        },
      },
      ['paths'],
    ),
    tool(
      'render_base',
      "Render a Base (.base) file, linked Base embeds in Markdown (`![[file.base#View]]`), or inline base blocks using the Verbex evaluator. Returns live markdown tables without requiring the Bases core plugin. Prefer this over reading notes one by one when the user's Base already filters the requested frontmatter list (e.g. unfinished tasks). Use render_dataview for Dataview blocks.",
      {
        path: pathProp,
        view: {
          type: 'string',
          description: L(
            {
              ko: 'Optional view name for a .base path, e.g. "미완료 과제들". Omit to render every view.',
              en: 'Optional view name for a .base path, e.g. "open tasks". Omit to render every view.',
            },
            locale,
          ),
        },
      },
      ['path'],
    ),
    tool(
      'render_dataview',
      'Render DQL Dataview blocks in one Markdown note. Requires the Dataview community plugin API. Returns markdown; dataviewjs is not executed. Use render_base for Base definitions and embeds. For an ad-hoc DQL query string not written in a note, use dataview_query (query/source).',
      {
        path: pathProp,
      },
      ['path'],
    ),
    tool(
      'list_files',
      'Find files by name or list visible vault files of all formats (metadata only, independent of text indexing). Use name for an exact filename including extension, or name_match=contains for a fragment. Filters and sorting apply before pagination; duplicate names return all matching paths. Optional folder is recursive. Sort by path (default), mtime, ctime or size, ascending or descending; default 200/max 500; continue using nextOffset. Extension ignores case and a leading dot.',
      {
        name: {
          type: 'string',
          description:
            'Filename including extension, or a literal fragment with name_match=contains. Not a path or glob.',
        },
        name_match: {
          type: 'string',
          enum: ['exact', 'contains'],
          description:
            'Ignored without a nonempty name. Default exact; NFC and case-insensitive comparison only.',
        },
        sort: {
          type: 'string',
          enum: ['path', 'mtime', 'ctime', 'size'],
          description: 'Sort field; default path.',
        },
        order: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort order; default asc. Ties use ascending path.',
        },
        offset: {
          type: 'number',
          description:
            'Zero-based offset, default 0. Continue from nextOffset.',
        },
        limit: {
          type: 'number',
          description: 'Page size, default 200, maximum 500.',
        },
        folder: { type: 'string', description: 'Optional folder path.' },
        extension: {
          type: 'string',
          description: 'Optional extension filter without the leading dot.',
        },
      },
    ),
    tool(
      'read_folder',
      L(
        {
          ko: 'Resolve a folder by its natural-language name (matched fuzzily, e.g. "한-UAE 협정문") and return the content of the notes under it, packed up to the context-window token budget. Markdown/base bodies are read; other formats are metadata with reader availability hints and require separate partial reading. Includes text files when they fit; otherwise fills the budget and lists the omitted files so you can page through the rest. When the name is ambiguous, reads the best match and lists the other candidate folders in the header; re-call with the exact path if the best match is wrong.',
          en: 'Resolve a folder by its natural-language name (matched fuzzily, e.g. "Korea-UAE agreement") and return the content of the notes under it, packed up to the context-window token budget. Markdown/base bodies are read; other formats are metadata with reader availability hints and require separate partial reading. Includes text files when they fit; otherwise fills the budget and lists the omitted files so you can page through the rest. When the name is ambiguous, reads the best match and lists the other candidate folders in the header; re-call with the exact path if the best match is wrong.',
        },
        locale,
      ),
      {
        offset: {
          type: 'number',
          description: 'File page offset, default 0; follow nextOffset.',
        },
        limit: {
          type: 'number',
          description: 'Files per page, default 200/max 500.',
        },
        folder: {
          type: 'string',
          description:
            'Folder name or path as the user described it; matched fuzzily against vault folders.',
        },
        extension: {
          type: 'string',
          description: 'Optional extension filter without the leading dot.',
        },
        max_tokens: {
          type: 'number',
          description:
            'Optional override for the token budget used to pack file content.',
        },
      },
      ['folder'],
    ),
    tool(
      'read_frontmatter',
      'Read one note frontmatter block as JSON. To find notes by a property value use find_by_property.',
      {
        path: pathProp,
      },
      ['path'],
    ),
    tool(
      'update_frontmatter',
      'Update only top-level frontmatter keys in an existing Markdown note. Provide set and/or remove; the tool parses and serializes the frontmatter into a full-file Diff proposal, preserves all non-frontmatter body bytes and line-ending style, rejects malformed YAML and conflicting operations, and never writes directly.',
      {
        path: pathProp,
        set: {
          type: 'object',
          description:
            'Top-level keys to set; each value replaces the whole old value (to drop one list item, pass the remaining array). Values: string, number, boolean, or string arrays.',
        },
        remove: {
          type: 'array',
          items: { type: 'string' },
          description: 'Top-level keys to remove.',
        },
      },
      ['path'],
    ),
    tool(
      'active_note',
      'Inspect the note currently active in the Obsidian workspace. Returns bounded frontmatter and a live heading outline without body content by default. Set include_content=true only when the bounded active-note body is needed; otherwise continue with read_file or partial-read tools. If no Markdown note is active, the result reports that fact and never guesses a path.',
      {
        include_content: {
          type: 'boolean',
          description:
            'Include a bounded current body in addition to metadata and outline. Default false.',
        },
      },
    ),
    tool(
      'find_by_property',
      L(
        {
          ko: '목록·전수 수집은 관련도 검색 대신 이 도구를 쓴다. List notes whose Obsidian Properties/frontmatter contain an exact property value, including resolved wikilinks and aliases. Use this FIRST for simple metadata questions such as "category 속성의 값이 개념들인 노트 목록"; reads metadataCache without Dataview. Plain mode pages with offset=nextOffset (no cursor). Only exhaustive=true returns a cursor, which export_property_query needs. key/value is always a positive match. To narrow it by a second field (e.g. category=과제들 but status not done), pass filter_field with exclude_values or include_values so the host filters the whole set; every result shows the full value distribution of filter_field/fields, so call once with limit=1 to see which values exist before choosing exclusions. When the user needs the complete list, pass exhaustive=true: the host fixes a snapshot, walks unseen rows itself and reports coverage; repeat with the returned cursor until coverage is complete. A long list does not fit in one chat answer: offer export_property_query to save the whole snapshot as a note instead of retyping rows.',
          en: 'Use this tool instead of relevance search for lists and exhaustive collection. List notes whose Obsidian Properties/frontmatter contain an exact property value, including resolved wikilinks and aliases. Use this FIRST for simple metadata questions such as "list notes whose category value is concepts"; reads metadataCache without Dataview. Plain mode pages with offset=nextOffset (no cursor). Only exhaustive=true returns a cursor, which export_property_query needs. key/value is always a positive match. To narrow it by a second field (e.g. category=tasks but stage not done), pass filter_field with exclude_values or include_values so the host filters the whole set; every result shows the full value distribution of filter_field/fields, so call once with limit=1 to see which values exist before choosing exclusions. When the user needs the complete list, pass exhaustive=true: the host fixes a snapshot, walks unseen rows itself and reports coverage; repeat with the returned cursor until coverage is complete. A long list does not fit in one chat answer: offer export_property_query to save the whole snapshot as a note instead of retyping rows.',
        },
        locale,
      ),
      {
        key: {
          type: 'string',
          description:
            'Property/frontmatter key to match, e.g. "category", "status", or "project". Case-insensitive.',
        },
        value: {
          type: 'string',
          description: L(
            {
              ko: 'Exact property value to match, e.g. "개념들". Arrays match when any item equals this value.',
              en: 'Exact property value to match, e.g. "concepts". Arrays match when any item equals this value.',
            },
            locale,
          ),
        },
        offset: {
          type: 'number',
          description:
            'Zero-based page offset; continue from nextOffset. With exhaustive=true omit it so the host reads unseen rows.',
        },
        exhaustive: {
          type: 'boolean',
          description:
            'Host-owned complete enumeration over a fixed snapshot with typed coverage. Default false (plain paging).',
        },
        cursor: {
          type: 'string',
          description:
            'Cursor from a previous exhaustive=true result for the same conditions in this conversation. Without it the host resumes the unfinished snapshot of the same conditions.',
        },
        restart: {
          type: 'boolean',
          description:
            'With exhaustive=true, discard the unfinished snapshot of the same conditions and start a new one. Default false.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Up to 8 frontmatter keys to show in each row.',
        },
        limit: {
          type: 'number',
          description: 'Page size, default 100, maximum 500.',
        },
        filter_field: {
          type: 'string',
          description: L(
            {
              ko: 'Use this (not query_notes) for a second-property condition. Second frontmatter key whose actual value filters the matches, e.g. "진행단계". Required with exclude_values/include_values.',
              en: 'Use this (not query_notes) for a second-property condition. Second frontmatter key whose actual value filters the matches, e.g. "stage". Required with exclude_values/include_values.',
            },
            locale,
          ),
        },
        exclude_values: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Drop matches whose filter_field equals any of these values (case-insensitive). Notes without the field are kept.',
        },
        include_values: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Keep only matches whose filter_field equals one of these values.',
        },
      },
      ['key', 'value'],
    ),
    tool(
      'export_property_query',
      L(
        {
          ko: '전수 목록을 노트로 저장한다. Save every row of a find_by_property exhaustive=true snapshot as a new Markdown table note (link + snapshot property values). The host writes the rows, so do not copy the list yourself; the user approves the new note. Call it with the cursor you already have, even after coverage is complete; do not re-run find_by_property first. Then answer with a short summary and the note path.',
          en: 'Save the exhaustive list as a note. Save every row of a find_by_property exhaustive=true snapshot as a new Markdown table note (link + snapshot property values). The host writes the rows, so do not copy the list yourself; the user approves the new note. Call it with the cursor you already have, even after coverage is complete; do not re-run find_by_property first. Then answer with a short summary and the note path.',
        },
        locale,
      ),
      {
        cursor: {
          type: 'string',
          description:
            'Cursor from a find_by_property exhaustive=true result in this conversation.',
        },
        path: {
          type: 'string',
          description: `Omit unless the user named a location. New .md path; default ${DEFAULT_EXPORT_FOLDER}/<condition> <yyyyMMdd-HHmm>.md. Existing notes are never overwritten.`,
        },
      },
      ['cursor'],
    ),
    tool(
      'parse_links',
      'List the internal links (wikilinks, embeds, Markdown links to vault files) written inside one note; external URLs are not included. For backlinks and the note neighbourhood use note_context.',
      {
        path: pathProp,
      },
      ['path'],
    ),
    tool(
      'write_file',
      'Create a NEW text note (or fully replace an existing one) with content you author. For .canvas, provide the complete JSON Canvas object. This is the way to create a brand-new Markdown report or draft: extract_to_file just copies an existing line range, and update_file/replace_in_file only work on a file that already exists. Provide the complete file content. The proposed change is shown as a Diff for approval (Auto Mode may apply it after a countdown). This writes text, not an HWP/HWPX document; use an available exporter tool for those formats.',
      { path: pathProp, content: contentProp },
      ['path', 'content'],
    ),
    tool(
      'update_file',
      'Replace the whole content of an existing file, or append content when append=true. For partial edits use replace_in_file instead of resending the file. The proposed change is shown as a Diff for approval (Auto Mode may apply it after a countdown).',
      {
        path: pathProp,
        content: {
          type: 'string',
          description:
            'Full file content, or only the text to add when append=true.',
        },
        append: {
          type: 'boolean',
          description: 'Append to the end when true.',
        },
      },
      ['path', 'content'],
    ),
    tool(
      'transform_large_file',
      'Transform an entire large existing Markdown file (translation, tone change, rewrite, or format-preserving conversion) with bounded structure-aware chunks, merge them in source order, and present one combined Diff for approval. Use this instead of read_file + update_file when the whole source cannot safely fit in context.',
      {
        path: pathProp,
        instruction: {
          type: 'string',
          description:
            'Transformation to apply consistently to every chunk of the file.',
        },
      },
      ['path', 'instruction'],
    ),
    tool(
      'extract_to_file',
      'Copy a 1-based inclusive line range out of an existing Markdown (.md/.base) note into a NEW note, server-side (you do not reproduce the content). Use this to split a large note into parts: call note_outline / read_note_lines to find split points, then extract_to_file once per part. The source note is not changed. The proposed change is shown as a Diff for approval (Auto Mode may apply it after a countdown).',
      {
        source_path: {
          type: 'string',
          description: 'Vault-relative path of the note to slice from.',
        },
        start_line: {
          type: 'number',
          description: 'First line to copy, 1-based and inclusive.',
        },
        end_line: {
          type: 'number',
          description: 'Last line to copy, 1-based and inclusive.',
        },
        new_path: {
          type: 'string',
          description:
            'Vault-relative path of the new note (must end in .md, differ from source_path, and not exist yet).',
        },
      },
      ['source_path', 'start_line', 'end_line', 'new_path'],
    ),
    tool(
      'split_file_by_chapters',
      'Split one complete Markdown source into PREAMBLE / CHAPTER ONE / CHAPTER TWO style files in a destination folder, server-side, in one multi-file Diff. Use this instead of repeated extract_to_file calls when the user requests chapter-by-chapter splitting. Only a line that is exactly PREAMBLE or CHAPTER ONE / CHAPTER 2 / CHAPTER IV (no #, no title) is a boundary; for 제1장 or Markdown-heading chapters use extract_to_file per chapter. Source order is preserved and every line is included once. The source file is not changed. Each part is written as <output_folder>/<boundary line>.md (e.g. CHAPTER ONE.md); an existing file with that name is overwritten.',
      {
        source_path: {
          type: 'string',
          description: 'Vault-relative Markdown source path.',
        },
        output_folder: {
          type: 'string',
          description:
            'Vault-relative destination folder for the chapter files.',
        },
      },
      ['source_path', 'output_folder'],
    ),
    tool(
      'replace_in_file',
      'Edit an existing note IN PLACE by replacing an exact text span. Supply old_string (the current text to replace, matched byte-for-byte including whitespace and indentation) and new_string (the replacement; empty string deletes the span). Only the changed snippet is sent, so this is the preferred, token-cheap way to revise notes — do NOT resend the whole file. old_string must be unique in the file unless replace_all=true. The proposed change is shown as a Diff for approval (Auto Mode may apply it after a countdown).',
      {
        path: pathProp,
        old_string: {
          type: 'string',
          description:
            'Exact existing text to replace, including surrounding whitespace/indentation. Must match the file exactly and be unique unless replace_all is true.',
        },
        new_string: {
          type: 'string',
          description:
            'Replacement text. Use an empty string to delete the matched span.',
        },
        replace_all: {
          type: 'boolean',
          description:
            'Replace every occurrence of old_string instead of requiring a unique match. Default false.',
        },
      },
      ['path', 'old_string', 'new_string'],
    ),
    tool(
      'patch_section',
      'Patch the body of one exact Markdown heading in an existing note. The body is everything up to the next heading of the same or higher level, subsections included: replace_body deletes those subsections too, and append adds after the last subsection. Use append, prepend, or replace_body and an occurrence number when the same heading appears more than once. Matching is case-insensitive like read_note_section but never fuzzy; an ambiguous or missing heading returns candidates/locations instead of guessing. The change is shown as a Diff for approval (Auto Mode may apply it after a countdown).',
      {
        path: pathProp,
        heading: {
          type: 'string',
          description: 'Exact heading text without or with leading # marks.',
        },
        mode: {
          type: 'string',
          enum: ['append', 'prepend', 'replace_body'],
          description: 'How to modify the selected heading body.',
        },
        content: {
          type: 'string',
          description:
            'Text to insert or to replace the section body with (not the whole file).',
        },
        occurrence: {
          type: 'number',
          description:
            '1-based duplicate heading occurrence. Required when the heading repeats.',
        },
      },
      ['path', 'heading', 'mode', 'content'],
    ),
    tool(
      'copy_file',
      'Copy an existing Markdown note into a new Markdown path on the server side. The source body does not travel through the model context; the target must be new, and the proposal records the source content as an optimistic dependency so a source edit during approval cancels the copy.',
      {
        path: pathProp,
        new_path: {
          type: 'string',
          description:
            'New vault-relative Markdown path; overwriting is forbidden.',
        },
      },
      ['path', 'new_path'],
    ),
    tool(
      'combine_files',
      'Combine 2-20 existing Markdown notes into one new Markdown note on the server side. Source order is preserved, originals remain unchanged, and every source is locked by captured content until approval; any missing, repeated-path, non-Markdown, target-collision, or source-drift condition fails the whole proposal. It does not remove duplicate blocks, redirect links, or merge into an existing note.',
      {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Two to twenty distinct vault-relative Markdown paths.',
        },
        new_path: {
          type: 'string',
          description:
            'New vault-relative Markdown path; overwriting is forbidden.',
        },
        separator: {
          type: 'string',
          description:
            'Separator between source bodies. Default is \n\n---\n\n.',
        },
        include_filenames: {
          type: 'boolean',
          description:
            'Insert a ## source-path heading before each body. Default true.',
        },
      },
      ['paths', 'new_path'],
    ),
    tool(
      'rename_file',
      'Rename a .md/.base note within the same folder using Obsidian link updates. Always requires explicit approval.',
      {
        path: pathProp,
        new_path: { type: 'string', description: 'New vault-relative path.' },
      },
      ['path', 'new_path'],
    ),
    tool(
      'move_file',
      'Move a .md/.base note to another folder (new_path may also change the file name) using Obsidian link updates. The destination must not exist. Always requires explicit approval.',
      {
        path: pathProp,
        new_path: {
          type: 'string',
          description: 'Destination vault-relative path.',
        },
      },
      ['path', 'new_path'],
    ),
    tool(
      'delete_file',
      "Delete a .md/.base note according to Obsidian's deleted-files setting (system trash, .trash folder, or permanent). Always requires explicit approval.",
      { path: pathProp },
      ['path'],
    ),
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const FILE_TOOL_DEFINITIONS = getFileToolDefinitions()

export const FILE_TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  export_census_report: {
    category: 'write',
    agentCallable: false,
    workflowCallable: false,
    pathArgs: ['path'],
  },
  restore_last_change: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  read_file: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
    evidenceRole: 'reading',
  },
  read_files: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    simpleCore: true,
    evidenceRole: 'reading',
  },
  render_base: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  render_dataview: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  list_files: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
  },
  read_folder: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
  },
  read_frontmatter: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
  },
  update_frontmatter: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
  },
  active_note: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'reading',
  },
  find_by_property: {
    category: 'read',
    agentCallable: true,
    workflowCallable: false,
    evidenceRole: 'discovery',
  },
  export_property_query: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  parse_links: {
    category: 'read',
    agentCallable: true,
    workflowCallable: true,
  },
  write_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
  },
  update_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
  },
  transform_large_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
    simpleCore: true,
  },
  extract_to_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
  },
  split_file_by_chapters: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  replace_in_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
    simpleCore: true,
  },
  patch_section: {
    category: 'write',
    agentCallable: true,
    workflowCallable: true,
  },
  copy_file: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  combine_files: {
    category: 'write',
    agentCallable: true,
    workflowCallable: false,
  },
  rename_file: {
    category: 'move',
    agentCallable: true,
    alwaysExplicitApproval: true,
    workflowCallable: true,
  },
  move_file: {
    category: 'move',
    agentCallable: true,
    alwaysExplicitApproval: true,
    workflowCallable: true,
  },
  delete_file: {
    category: 'delete',
    agentCallable: true,
    alwaysExplicitApproval: true,
    workflowCallable: true,
  },
}
