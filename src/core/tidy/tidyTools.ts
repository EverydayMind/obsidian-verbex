import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import type { RequestTool } from '../../types/llm/request'
import type { ToolRegistryEntry } from '../tools/toolCatalogRegistry'
import { tool } from '../tools/toolHelper'

import {
  entityNoteDescription,
  splitNoteTitleDescription,
} from './tidyToolDescriptions'

/**
 * Note tidy tools (vault-tidy Skill). Exposed only when the Skill is active or
 * the user names a tool. Every write asks for its own explicit approval.
 */
export const TIDY_TOOL_NAMES = [
  'tidy_scan',
  'compare_notes',
  'merge_notes',
  'create_entity_note',
  'link_mentions',
  'split_note',
  'retitle_note',
] as const

const NAMES = new Set<string>(TIDY_TOOL_NAMES)
export const isTidyTool = (name: string): boolean => NAMES.has(name)

const retryRejected = {
  type: 'boolean',
  description:
    'Only when the user explicitly asks again for a proposal they rejected in this conversation.',
}

const notePath = (description: string) => ({ type: 'string', description })

const writeTool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
) =>
  tool(
    name,
    description,
    { ...properties, retry_rejected: retryRejected },
    required,
  )

export function getTidyToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    tool(
      'tidy_scan',
      'List note tidy candidates inside a folder or note list as facts only: similar note pairs (shared identical blocks, title overlap, shared links), link names with no note yet, notes without a `type` property, titles that are unsafe as Windows file names, and task/idea notes with their status. Read-only.',
      {
        folder: notePath('Vault-relative folder to scan. Empty for the vault.'),
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit Markdown note paths instead of a folder.',
        },
        limit: {
          type: 'number',
          description: 'Maximum items per list. Default 20.',
        },
      },
    ),
    tool(
      'compare_notes',
      'Compare two notes block by block: identical blocks (merge_notes drops these itself), blocks only in each note (first-note ids are for merge_notes extra_drop_block_ids), anchors other notes link to, backlink counts and conflicting frontmatter keys. Read-only.',
      {
        path: notePath('Merge source; block ids refer to this note.'),
        other_path: notePath('Second note (usually the merge target).'),
      },
      ['path', 'other_path'],
    ),
    writeTool(
      'merge_notes',
      "Merge one note into another with Obsidian's Note Composer: blocks the target already has are removed from the source first, the rest is appended (or prepended) to the target, links to the source are redirected to the target and the source goes to the trash. Requires the Note Composer core plugin. High-risk; always asks for approval.",
      {
        source_path: notePath('Note that is merged away.'),
        target_path: notePath('Note that remains.'),
        position: {
          type: 'string',
          enum: ['append', 'prepend'],
          description: 'Where the source text goes. Default append.',
        },
        drop_duplicates: {
          type: 'boolean',
          description:
            'Remove source blocks identical to target blocks. Default true.',
        },
        extra_drop_block_ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Source block ids from compare_notes you judge to be near-duplicates; shown to the user separately.',
        },
        frontmatter_conflicts: {
          type: 'string',
          enum: ['keep_target', 'take_source'],
          description:
            'Which value wins for conflicting properties. Default keep_target.',
        },
      },
      ['source_path', 'target_path'],
    ),
    writeTool(
      'create_entity_note',
      entityNoteDescription(locale),
      {
        name: { type: 'string', description: 'Canonical entity name (title).' },
        entity_type: {
          type: 'string',
          description:
            'person, organization, concept, place, product, law, ...',
        },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other names, abbreviations or spellings.',
        },
        summary: {
          type: 'string',
          description: 'One to three sentences about the entity from the note.',
        },
        source_path: notePath('Note that mentions the entity.'),
        mention_text: {
          type: 'string',
          description: 'Exact text of the mention to link. Default: name.',
        },
        occurrence: {
          type: 'number',
          description: 'Which unlinked occurrence to link, 1-based. Default 1.',
        },
      },
      ['name', 'entity_type', 'source_path'],
    ),
    writeTool(
      'link_mentions',
      'Link unlinked mentions of an existing note inside one source note. Code, existing links, frontmatter, URLs and headings are skipped. One call changes one note and asks for approval.',
      {
        entity_path: notePath('Existing note to link to.'),
        source_path: notePath('Note whose mentions are linked.'),
        mention_texts: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exact surface texts. Default: the title and aliases.',
        },
        mode: {
          type: 'string',
          enum: ['first', 'all'],
          description: 'Link only the first mention (default) or all of them.',
        },
      },
      ['entity_path', 'source_path'],
    ),
    writeTool(
      'split_note',
      "Move a separable part of a note (a heading section, or the text from start_text through end_text) into a new note with Obsidian's Note Composer. The new note gets a status-summary title and type/status properties; the original place keeps a link or embed per the Note Composer setting. Requires the Note Composer core plugin. Always asks for approval.",
      {
        source_path: notePath('Note to split.'),
        heading: {
          type: 'string',
          description:
            'Heading text (no # marks, exact case, unique in the note) whose whole section is moved; otherwise use start_text/end_text. The section includes its subsections.',
        },
        start_text: {
          type: 'string',
          description: 'Exact unique text where the moved range starts.',
        },
        end_text: {
          type: 'string',
          description: 'Exact unique text where the moved range ends.',
        },
        new_title: {
          type: 'string',
          description: splitNoteTitleDescription(locale),
        },
        note_type: {
          type: 'string',
          description: 'task, idea, decision, plan, ... Default task.',
        },
        status: { type: 'string', description: 'Current status property.' },
      },
      ['source_path', 'new_title'],
    ),
    writeTool(
      'retitle_note',
      'Rename a note in place (same folder) with Obsidian, updating links to it. The old title is kept in aliases by default. Use (not rename_file) when a task/idea status changed or an entity title is not the canonical name. High-risk; always asks for approval.',
      {
        path: notePath('Note to rename.'),
        new_title: { type: 'string', description: 'New title without .md.' },
        keep_old_title_as_alias: {
          type: 'boolean',
          description: 'Add the old title to aliases. Default true.',
        },
      },
      ['path', 'new_title'],
    ),
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const TIDY_TOOL_DEFINITIONS = getTidyToolDefinitions()

type TidyRegistryEntry = Omit<ToolRegistryEntry, 'definition'>

const read: TidyRegistryEntry = {
  category: 'read',
  agentCallable: true,
  workflowCallable: false,
}
const write: TidyRegistryEntry = {
  category: 'write',
  agentCallable: true,
  workflowCallable: false,
  alwaysExplicitApproval: true,
}
const move: TidyRegistryEntry = { ...write, category: 'move' }

export const TIDY_TOOL_REGISTRY: Record<
  (typeof TIDY_TOOL_NAMES)[number],
  TidyRegistryEntry
> = {
  tidy_scan: { ...read, evidenceRole: 'discovery' },
  compare_notes: { ...read, evidenceRole: 'reading', pathArgs: ['other_path'] },
  merge_notes: { ...move, requiresCorePlugin: 'note-composer' },
  create_entity_note: { ...write },
  link_mentions: { ...write },
  split_note: { ...write, requiresCorePlugin: 'note-composer' },
  retitle_note: { ...move },
}
