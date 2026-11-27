import { en } from '../i18n/locales/en'
import { ko } from '../i18n/locales/ko'

// Preserve Korean input aliases used by explicitToolMentions in every UI locale.
export const NATIVE_TOOL_TITLES: Record<string, string> = {
  restore_last_change: ko.ui.nativeToolTitles.restoreRecentChanges,
  read_file: ko.ui.nativeToolTitles.readFile,
  read_files: ko.ui.nativeToolTitles.readMultipleFiles,
  render_base: ko.ui.nativeToolTitles.renderBasesResults,
  search_vault: ko.ui.nativeToolTitles.vaultKeywordSearch,
  semantic_search: ko.ui.nativeToolTitles.vaultSemanticSearch,
  search_context_tree: ko.ui.nativeToolTitles.searchContextForest,
  iterative_search: ko.ui.nativeToolTitles.iterativeSearch,
  obsidian_query: ko.ui.nativeToolTitles.searchPropertiesAndBody,
  read_folder: ko.ui.nativeToolTitles.readFolder,
  list_files: ko.ui.nativeToolTitles.listFiles,
  folder_tree: ko.ui.nativeToolTitles.folderTree,
  read_frontmatter: ko.ui.nativeToolTitles.readProperties,
  update_frontmatter: ko.ui.nativeToolTitles.updateProperties,
  active_note: ko.ui.nativeToolTitles.currentNote,
  find_by_property: ko.ui.nativeToolTitles.findByProperty,
  parse_links: ko.ui.nativeToolTitles.readLinks,
  vault_graph: ko.ui.nativeToolTitles.vaultRelationshipGraph,
  graph_path: ko.ui.nativeToolTitles.relationshipPath,
  graph_stats: ko.ui.nativeToolTitles.graphStatistics,
  note_context: ko.ui.nativeToolTitles.noteRelationships,
  note_outline: ko.ui.nativeToolTitles.noteOutline,
  search_in_file: ko.ui.nativeToolTitles.searchInFile,
  note_outline_by_pattern: ko.ui.nativeToolTitles.outlineByPattern,
  read_note_lines: ko.ui.nativeToolTitles.readSpecifiedLines,
  read_note_section: ko.ui.nativeToolTitles.readSection,
  read_note_around: ko.ui.nativeToolTitles.readSurroundingLines,
  list_tags: ko.ui.nativeToolTitles.listTags,
  find_by_tag: ko.ui.nativeToolTitles.findByTag,
  write_file: ko.ui.nativeToolTitles.writeFile,
  update_file: ko.ui.nativeToolTitles.updateFile,
  replace_in_file: ko.ui.nativeToolTitles.replaceContents,
  patch_section: ko.ui.nativeToolTitles.modifySection,
  copy_file: ko.ui.nativeToolTitles.copyFile,
  combine_files: ko.ui.nativeToolTitles.combineFiles,
  export_property_query: ko.ui.nativeToolTitles.saveExhaustiveListNote,
  rename_file: ko.ui.nativeToolTitles.renameFile,
  move_file: ko.ui.nativeToolTitles.moveFile,
  delete_file: ko.ui.nativeToolTitles.deleteFile,
  extract_to_file: ko.ui.nativeToolTitles.extractSection,
  build_review_index: ko.ui.nativeToolTitles.buildReviewIndex,
  request_tool: ko.ui.nativeToolTitles.requestToolDevelopment,
  tidy_scan: ko.ui.nativeToolTitles.findNoteCleanupCandidates,
  date_calc: ko.ui.nativeToolTitles.dateCalculation,
  calculate: ko.ui.nativeToolTitles.arithmeticCalculation,
  query_notes: ko.ui.nativeToolTitles.aggregateNotes,
  list_tasks: ko.ui.nativeToolTitles.listTasks,
  audit_links: ko.ui.nativeToolTitles.auditLinks,
  compare_notes: ko.ui.nativeToolTitles.compareNoteBlocks,
  merge_notes: ko.ui.nativeToolTitles.mergeNotes,
  create_entity_note: ko.ui.nativeToolTitles.createEntityNote,
  link_mentions: ko.ui.nativeToolTitles.linkMentions,
  split_note: ko.ui.nativeToolTitles.splitNote,
  retitle_note: ko.ui.nativeToolTitles.retitleNote,
  daily_note: ko.ui.nativeToolTitles.dailyNote,
  create_from_template: ko.ui.nativeToolTitles.createFromTemplate,
  list_bookmarks: ko.ui.nativeToolTitles.listBookmarks,
  open_in_obsidian: ko.ui.nativeToolTitles.openInObsidian,
  read_canvas: ko.ui.nativeToolTitles.readCanvas,
  edit_canvas: ko.ui.nativeToolTitles.editCanvas,
}

/** Titles are input aliases in both languages, independent of the UI locale. */
export const ENGLISH_NATIVE_TOOL_TITLES: Record<string, string> =
  Object.fromEntries(
    Object.entries(NATIVE_TOOL_TITLES).map(([name, title]) => {
      const key = Object.entries(ko.ui.nativeToolTitles).find(
        ([, value]) => value === title,
      )?.[0] as keyof typeof en.ui.nativeToolTitles
      return [name, en.ui.nativeToolTitles[key]]
    }),
  )
