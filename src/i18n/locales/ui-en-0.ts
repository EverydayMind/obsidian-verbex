export const ui0 = {
  checkpointRuns: {
    title: 'Restore points',
    description:
      'Restore files changed by a conversation or run to their earlier state. Only the {p0} most recent with something left to restore are listed.',
    summary: '{p0} restore point(s) · {p1} file(s)',
    more: 'and {p0} more',
    confirm:
      'This restores every remaining restore point of this conversation (run), newest first. Files you edited afterwards are asked about one by one. Some files may be skipped because of detected changes, locks or a declined prompt.',
    result: 'Restored: {p0}, skipped: {p1}, failed: {p2}',
    busy: 'Restore is available after the agent run or apply finishes.',
    empty: 'There are no restore points to restore.',
    restore: 'Restore',
    cancel: 'Cancel',
    loading: 'Loading...',
    error: 'Could not load or use restore points: {p0}',
  },
  main: {
    autoModeOn: 'Verbex Auto Mode ON (countdown {p0}s, excluding {p1})',
    autoModeOff: 'Verbex Auto Mode OFF',
    invalidSettings: 'Invalid settings:\n{p0}',
    embeddingIndexReady:
      'Embedding index for {p0} is ready. Review retained model indexes in the database manager.',
    reloadingForMigration: 'Reloading Verbex due to migration',
    reviewUnresolvedBrowserOperations: 'Review unresolved browser operations',
    embeddingRuntimeMissing:
      'The local embedding runtime for semantic search is not installed. Keyword search still works.',
    embeddingGetOfflinePack: 'Get the offline pack',
    embeddingSwitchToKeyword: 'Switch to keyword search',
    vectorSaveTitle: 'Error: save failed',
    vectorSaveMessage:
      'Failed to save the vector database changes. Please report this issue to the developer.',
    vectorChunkTitle: 'Error: chunk embedding failed',
    vectorChunkMessage:
      'Some files failed to process. Please report this issue to the developer if it persists.',
    vectorEmbeddingTitle: 'Error: embedding failed',
    vectorEmbeddingMessage:
      "The indexing process was interrupted because several files couldn't be processed.\nPlease report this issue to the developer if it persists.",
    contextPreview: 'Context preview',
    verbexOpenChat: 'Verbex: Open chat',
    verbexAddSelectionToChat: 'Verbex: Add selection to chat',
    verbexShowStatus: 'Verbex: Show status',
    verbexShowRelatedNotes: 'Verbex: Show related notes',
    verbexUpdateIndex: 'Verbex: Update index',
    verbexUpdateModifiedFileIndex: 'Verbex: Update modified file index',
    verbexRefreshSkillList: 'Verbex: Refresh Skill list',
    verbexShowCurrentPlan: 'Verbex: Show current Plan',
    verbexStopRun: 'Verbex: Stop run',
    verbexResumeRun: 'Verbex: Resume run',
    verbexRunAgentOnSelectionToolCalling:
      'Verbex: Run Agent on selection (tool-calling)',
    selectTheRequestTextToSendTo:
      'Select the request text to send to the Agent.',
    startingVerbexAgent: 'Starting Verbex Agent…',
    verbexAgentToolCallsTurns:
      'Verbex Agent {p0} — {p1} tool calls, {p2} turns.',
    completed: 'completed',
    iterationLimitReached: 'iteration limit reached',
    verbexAgentError: 'Verbex Agent error: {p0}',
    verbexContinueWritingAtCursor: 'Verbex: Continue writing (at cursor)',
    verbexRewriteSelection: 'Verbex: Rewrite selection',
    noCheckpointsToRestore: 'No restore points to restore.',
    verbexRollbackRestoredSkippedFailedSkippedFiles:
      'Verbex: {p0} rollback — {p1} restored, {p2} skipped, {p3} failed. Skipped files were changed after saving or their save result was uncertain, so they were left unchanged: {p4}',
    verbexRestoredToCheckpoint: 'Verbex: Restored {p0} to restore point {p1}.',
    verbexListCheckpoints: 'Verbex: Restore points',
    verbexToggleAutoMode: 'Verbex: Toggle Auto Mode',
    verbexCleanUpCheckpointsRetentionPolicy:
      'Verbex: Clean up restore points (retention policy)',
    verbexRemovedCheckpointsFreedKB:
      'Verbex: Removed {p0} restore points, freed {p1}KB.',
    noExpiredCheckpointsToCleanUp: 'No expired restore points to clean up.',
    verbexInitializationFailedChatRunsAreBlocked:
      'Verbex initialization failed — {p0}. Chat runs are blocked.',
    approveHWPXBinaryChanges: 'Allow these document changes?',
    approveAllProposalsAndSave: 'Allow all and save',
    cannotOpenTheVerbexChatView: 'Cannot open the Verbex chat view.',
    noTextBeforeTheCursorToContinue:
      'No text before the cursor to continue. Place the cursor in the document body.',
    verbexContinueWriting: 'Verbex continue writing',
    optionalDirectionLeaveBlankToContinueAs:
      'Optional direction (leave blank to continue as is). Example: summarize in the next paragraph',
    continueWriting: 'Continue writing',
    verbexContinuing: 'Verbex: Continuing…',
    noContentWasGenerated: 'No content was generated.',
    verbexContinuationError: 'Verbex continuation error: {p0}',
    selectTheTextToRewriteFirst: 'Select the text to rewrite first.',
    verbexRewrite: 'Verbex rewrite',
    howShouldItBeRevisedExampleMore:
      'How should it be revised? Example: more concise / polite tone / bullet points',
    rewrite: 'Rewrite',
    verbexRewriting: 'Verbex: Rewriting…',
    verbexRewriteError: 'Verbex rewrite error: {p0}',
    noChanges: 'No changes.',
    verbexRewritePreview: 'Verbex rewrite — preview',
    replaceTheSelectionWithTheFollowingN:
      'Replace the selection with the following:\n\n{p0}',
    replace: 'Replace',
    verbexBM25IndexIsUnavailableCheckThe:
      'Verbex: BM25 index is unavailable. Check the status view.',
    verbexBM25IndexMayBeOutOf:
      'Verbex: BM25 index may be out of date. Check the status view.',
    verbexCouldNotUpdateTheVaultIndex:
      'Verbex could not update the vault index. Use "Verbex: Update modified file index" from the command palette.',
  },
  ChangeApprovalNotes: {
    create: 'Create',
    modify: 'Modify',
    delete: 'Delete',
    rename: 'Rename',
    move: 'Move',
    filesChangedByThisApproval: 'Other files changed together: ',
    fileS: ' file(s)',
    obsidianUpdatesLinks: ' — Obsidian updates links',
    viewResult: 'View result',
  },
  ToolManagementModal: {
    toolManagement: 'Tool management',
  },
  TextRollbackApprovalModal: {
    approveTextFileRestoration: 'Allow restoring these files?',
    restoreTheCurrentContentsOfTheFollowing:
      'Restore the current contents of the following files to an earlier state. Later edits may also be lost.',
    runCheckpoint: 'Run: {p0} · Restore point: {p1}',
    deleteCurrentFile: 'Delete current file',
    recreatePreviousContents: 'Recreate previous contents',
    overwriteWithPreviousContents: 'Overwrite with previous contents',
    changedAfterApplying: ' (changed after applying)',
    changesAfterApplyingNotConfirmed: ' (changes after applying not confirmed)',
    filesChangedWhileApprovalIsPendingWill:
      'Files that change while you decide are not restored. This applies to this restore point once.',
    allowThisRestoration: 'Allow this restoration',
    skip: 'Skip',
    details: 'Details',
  },
  SessionEditApprovalModal: {
    allowDocumentWorkingCopyEdits: 'Allow AI to edit this document?',
    allowAIToEditTheWorkingCopy: 'Document: {p0}',
    requestedToolV: 'Requested tool: {p0} · {p1} v{p2}',
    thisDocumentIsOpenOnScreenEdits:
      'This document is open on screen. You will see the edits right away.',
    thisDocumentIsNotOpenOnScreen:
      'This document is not open on screen. You will not see the edits right away, and they stay unsaved until you save or discard them.',
    furtherEditsToThisDocumentInThis:
      'The file itself is not changed until you allow saving. Verbex will not ask again for edits in this conversation, and will ask once more before saving.',
    editsAreSentAndRecorded:
      'What is edited is sent to the AI model service you set up. The plugin may keep records in its own folder so that edits can be recovered.',
    allowInThisConversation: 'Allow in this conversation',
    deny: "Don't allow",
  },
}
