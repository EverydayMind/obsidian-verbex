export const ui0 = {
  main: {
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
    noCheckpointsToRestore: 'No checkpoints to restore.',
    verbexRollbackRestoredSkippedFailedSkippedFiles:
      'Verbex: {p0} rollback — {p1} restored, {p2} skipped, {p3} failed. Skipped files were changed after saving or their save result was uncertain, so they were left unchanged: {p4}',
    verbexRestoredToCheckpoint: 'Verbex: Restored {p0} to checkpoint {p1}.',
    verbexListCheckpoints: 'Verbex: List checkpoints',
    verbexCheckpointsLatestFiles:
      '{p0} Verbex checkpoints (latest: {p1}, {p2} files).',
    noCheckpointsInTheActiveRun: 'No checkpoints in the active Run.',
    verbexToggleAutoMode: 'Verbex: Toggle Auto Mode',
    verbexCleanUpCheckpointsRetentionPolicy:
      'Verbex: Clean up checkpoints (retention policy)',
    verbexRemovedCheckpointsFreedKB:
      'Verbex: Removed {p0} checkpoints, freed {p1}KB.',
    noExpiredCheckpointsToCleanUp: 'No expired checkpoints to clean up.',
    verbexInitializationFailedChatRunsAreBlocked:
      'Verbex initialization failed — {p0}. Chat runs are blocked.',
    approveHWPXBinaryChanges: 'Approve HWPX binary changes',
    approveAllProposalsAndSave: 'Approve all proposals and save',
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
    filesChangedByThisApproval: 'Files changed by this approval: ',
    fileS: ' file(s)',
    obsidianUpdatesLinks: ' — Obsidian updates links',
    viewResult: 'View result',
  },
  ToolManagementModal: {
    toolManagement: 'Tool management',
  },
  TextRollbackApprovalModal: {
    approveTextFileRestoration: 'Approve text file restoration',
    restoreTheCurrentContentsOfTheFollowing:
      'Restore the current contents of the following files to an earlier state. Later edits may also be lost.',
    runCheckpoint: 'Run: {p0} · Checkpoint: {p1}',
    deleteCurrentFile: 'Delete current file',
    recreatePreviousContents: 'Recreate previous contents',
    overwriteWithPreviousContents: 'Overwrite with previous contents',
    changedAfterApplying: ' (changed after applying)',
    changesAfterApplyingNotConfirmed: ' (changes after applying not confirmed)',
    filesChangedWhileApprovalIsPendingWill:
      'Files changed while approval is pending will not be restored. This approval applies only to this checkpoint once.',
    allowThisRestoration: 'Allow this restoration',
    skip: 'Skip',
  },
  SessionEditApprovalModal: {
    allowDocumentWorkingCopyEdits: 'Allow document working copy edits',
    allowAIToEditTheWorkingCopy:
      'Allow AI to edit the working copy of {p0} in this conversation?',
    requestedToolV: 'Requested tool: {p0} · {p1} v{p2}',
    thisDocumentIsOpenOnScreenEdits:
      'This document is open on screen. Edits are immediately visible.',
    thisDocumentIsNotOpenOnScreen:
      'This document is not open on screen. Edits are not immediately visible and remain unsaved until you save or discard them.',
    furtherEditsToThisDocumentInThis:
      'Further edits to this document in this conversation will proceed without asking again, with each result shown in chat. The original file is unchanged. Saving requires separate approval. The plugin may keep recovery records in its own folder. Edited document contents may be sent to the LLM provider.',
    allowInThisConversation: 'Allow in this conversation',
    deny: 'Deny',
  },
}
