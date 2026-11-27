export const ui2 = {
  useBrowserContext: {
    selectATargetWebTab: 'Select a target web tab',
    noOpenWebTabs: 'No open web tabs',
    webHandsReadingIsOff: 'Web Hands reading is off',
    webTabUnavailable: 'Web tab unavailable',
    noOpenWebTabs2: 'No open web tabs',
    webTabIsHidden: 'Web tab is hidden',
    webTabHasNotLoaded: 'Web tab has not loaded',
    webTabContextCleared: 'Web tab context cleared',
    checkWebToolApprovalAndReadingSettings:
      'Check web tool approval and reading settings',
    webTab: 'Web tab',
    webTabTarget: 'Web tab target',
    autoMostRecentlyUsedTab: 'Auto — most recently used tab',
    off: 'Off',
    selectedTabUnavailable: 'Selected tab unavailable',
    hidden: ' (hidden)',
    refreshWebTabs: 'Refresh web tabs',
  },
  ToolMessage: {
    apply: 'Apply',
    reject: 'Reject',
    allow: 'Allow',
    abort: 'Abort',
    parameters: 'Parameters:',
    result: 'Result:',
    error: 'Error:',
    noParameters: 'No parameters',
    compactView: 'Compact view',
    advancedViewRawData: 'Advanced view (raw data)',
    proposalBeforeSaving: 'Proposal before saving',
    saveDenied: 'Save denied',
    fileSaveVerified: 'File save verified',
    saveFailed: 'Save failed',
    saveStatusUnknownDoNotRetryAutomatically:
      'Save status unknown — do not retry automatically',
    checkpoint: 'Restore point: ',
    furtherExecutionStoppedCheckTheSaveAnd:
      'Further execution stopped. Check the save and record status.',
  },
  SkillAvailability: {
    requiredPluginsAreDisabled: 'Required plugins are disabled: {p0}',
    skillNoLongerAvailable:
      'This Skill is no longer in the catalog, so it is not used',
  },
  SessionGrants: {
    turnOffSavedParagraphLocationCollection:
      'Turn off saved paragraph location collection',
    turnOnSavedParagraphLocationCollection:
      'Turn on saved paragraph location collection',
    savedParagraphLocationCollectionHint:
      'Optional. When on, Verbex records where paragraphs land in HWPX files saved in this conversation, so you can jump to them later. Records are cleared when the conversation ends.',
    appliesToSubsequentHWPXSavesInThis:
      'Applies to subsequent HWPX saves in this conversation. Records are cleared when it ends.',
    documentEditingApprovalForThisConversation:
      'Documents AI may edit in this conversation',
    documentEditingApprovalForThisConversation2:
      'Documents AI may edit in this conversation',
    editingApprovalRevokedAppliedChangesRemainIn:
      'Editing is no longer allowed. Changes already made remain in the copy being edited.',
    editingApprovalRevokedDocumentDisconnectionCouldNot:
      'Editing is no longer allowed. Verbex could not confirm that the document was disconnected.',
    revokeEditingApproval: 'Stop allowing edits',
  },
  SessionExportButton: {
    exportCurrentSessionChatAndLogs: 'Export current session chat and logs',
    savesChatToolResultsRunRecordsAnd:
      'Saves chat, tool results, Run records, and shared diagnostics. May include document contents and paths; review before sharing. Settings and original attachments are not collected.',
    thisConversationIsRunningChatUpTo:
      'This conversation is running. Chat up to the button click and logs at collection time will be saved.',
    destinationFolder: 'Destination folder',
    enterTheAbsolutePathOfAnExisting:
      'Enter the absolute path of an existing folder. A new export folder will be created inside it.',
    export: 'Export',
    enableSettingsAdvancedDebugModeToExport:
      'Enable Settings → Advanced → Debug mode to export',
    exportComplete: 'Export complete: {p0}',
    exportedFolder: 'Exported folder',
    exportedFolderPath: 'Exported folder path',
    copyPath: 'Copy path',
    exportedFolderPathCopied: 'Exported folder path copied.',
    couldNotCopyThePathClickThe:
      'Could not copy the path. Click the exported folder path field and copy it manually.',
    sessionExported: 'Session exported: {p0}',
    exportComplete2: 'Export complete',
    exportCompletedButTheSuggestedFolderCould:
      'Export completed, but the suggested folder could not be saved for next time.',
    exportFailedCheckTheFolderPathAnd:
      'Export failed. Check the folder path and write permission, then try again. A failure during saving may leave an incomplete folder without manifest.json.',
    close: 'Close',
    exportCurrentSessionChatAndLogs2: 'Export current session chat and logs',
    exportCurrentSessionChatAndLogs3: 'Export current session chat and logs',
    enableSettingsAdvancedDebugModeToExport2:
      'Enable Settings → Advanced → Debug mode to export',
  },
  sessionEditCardModel: {
    manualEditingNeeded: 'Manual editing needed · {p0}',
    protectedObjectsPreventedEditingOpenTheLocation:
      'Protected objects prevented editing. Open the location and check it manually.',
    thisEditWasAppliedToTheWorking:
      'This edit was applied to the copy being edited. Check the document for its current save status.',
    thisDocumentWasOffScreenWhenEdited:
      'This document was off screen when edited. View the location to check its current state.',
    redrawnFromPage: 'Redrawn from page {p0}.',
    workingCopyEdit: 'Edit before saving · {p0}',
  },
  SessionEditCard: {
    openedTheLocationThatCouldNotBe:
      'Opened the location that could not be edited.',
    openedTheEditedLocation: 'Opened the edited location.',
    documentOpenedCheckTheCurrentDocumentFor:
      'Document opened. Check the current document for the previous edit location.',
    couldNotOpenTheDocument: 'Could not open the document.',
    lastEditUndone: 'Last edit undone.',
    couldNotUndo: 'Could not undo: {p0}',
    checkStatus: 'Check status',
    couldNotUndo2: 'Could not undo.',
    andMoreLocations: 'and {p0} more locations',
    processing: 'Processing…',
    open: 'Open',
    viewLocation: 'View location',
    processing2: 'Processing…',
    undo: 'Undo',
  },
  selectionEvidence: {
    skillActivatedByKeyword: 'Skill activated by keyword: {p0}',
    skillActivatedByKeywordFollowedModelSuggestion:
      'Skill activated by keyword: {p0} · Followed model suggestion because another keyword Skill uses a different workflow',
    agreementKeywordModelSuggestionInformedBySelected:
      'Agreement keyword · Model suggestion informed by selected file size',
    modelSuggestionNoKeywordMatch: 'Model suggestion · No keyword match',
    modelSuggestionNoWorkflowSelected:
      'Model suggestion · No workflow selected',
  },
  QueryProgress: {
    readingMentioned: 'Reading mentioned files',
    indexingFiles: 'Indexing {p0} file',
    chunksIndexed: '{p0}/{p1} chunks indexed',
    waitingRateLimit: 'Waiting for rate limit to reset...',
    queryingVault: 'Querying the vault',
    expandingNotes: 'Expanding related notes',
    followingLinks: 'Following wikilinks and backlinks',
    readingRelated: 'Reading related files',
    rank: 'Rank',
    lLMIsThinkingAttempt: 'LLM is thinking... (step {p0})',
    runningToolAttempt: "Running tool '{p0}'... (step {p1})",
    waitingForApproval: "Waiting for your approval: '{p0}'",
    largeDocumentConversion: 'Large document conversion',
    wholeDocumentAnalysis: 'Whole-document analysis',
    reviewBySection: 'Review by section',
    crossSectionSynthesis: 'Cross-section synthesis',
    crossCheckOmissionsAndContradictions:
      'Cross-check omissions and contradictions',
    convertBySection: 'Convert by section',
    inProgress: '{p0} in progress: {p1}',
  },
}
