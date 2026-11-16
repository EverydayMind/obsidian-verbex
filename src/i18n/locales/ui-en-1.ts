export const ui1 = {
  McpApprovalModal: {
    approveMCPCall: 'Approve MCP call',
    confirmAutomaticMCPApproval: 'Confirm automatic MCP approval',
    thisToolSendsArgumentsToAnExternal:
      'This tool sends arguments to an external server or local program and may change services or files. Vault checkpoints cannot restore external changes. Results may later be sent to the LLM provider.',
    argumentsToSend: 'Arguments to send',
    reviewToolDefinition: 'Review tool definition',
    automaticApprovalAppliesToAllFutureArguments:
      'Automatic approval applies to all future arguments for this tool. Changes to the server configuration or tool definition require approval again.',
    allowThisCall: 'Allow this call',
    automaticallyAllowThisTool: 'Automatically allow this tool',
    deny: 'Deny',
  },
  InlinePromptModal: {
    run: 'Run',
    cancel: 'Cancel',
  },
  IndexTargetModal: {
    confirmWorkingFolder: 'Confirm working folder',
    enterAFolderPathToWorkIn: 'Enter a folder path to work in or reuse.',
    thisFolderHasAnExistingIndexWiki:
      'This folder has an existing index/wiki ({p0} notes). Reuse it or rebuild it. Rebuilding resets progress (_checklist.md) and preserves findings.',
    thisFolderHasNotesButNoChecklist:
      'This folder has {p0} notes but no checklist. Rebuilding creates files in this folder.',
    thisFolderIsEmptyOrNewA:
      'This folder is empty (or new). A new index will be built.',
    whereShouldTheReviewFolderForGo:
      'Where should the review folder for "{p0}" go?',
    exampleIndexWorkingFolder: 'Example: Index/working_folder',
    reuseExistingIndex: 'Reuse existing index',
    rebuildRegenerate: 'Rebuild (regenerate)',
    buildNewIndex: 'Build new index',
    cancel: 'Cancel',
  },
  DocumentJobBodyChoiceModal: {
    paragraphs: '{p0} · {p1} paragraphs · {p2}{p3}',
    noSymbol: '(no symbol)',
    chooseBodyFormatting: 'Choose body formatting',
    chooseAParagraphFormatFromTheSample:
      'Choose a paragraph format from the sample document for the body. Body paragraphs in the new document will use this format.',
    skip: 'Skip',
  },
  DocumentIndexScopeModal: {
    chooseFoldersForDocumentSearch: 'Choose folders for document search',
    extractHWPHWPXAndPDFLocallyEnter:
      'Extract HWP, HWPX, and PDF locally. Enter a folder path or pattern per line. Explicitly enter **/* to include the entire Vault.',
    includePaths: 'Include paths',
    enableForSelectedScope: 'Enable for selected scope',
    cancel: 'Cancel',
  },
  DiscardAgentChangesModal: {
    discardAIChanges: 'Discard AI changes',
    discardTheAIChangesToFromThe:
      'Discard the AI changes to {p0} from the working copy? The original file is unchanged.',
    cancel: 'Cancel',
    discard: 'Discard',
  },
  CommitApprovalModal: {
    approveDocumentSave: 'Approve document save',
    approveSaveAs: 'Approve Save As',
    approveNewDocument: 'Approve new document',
    saveTheWorkingCopyOfToIts: 'Save the working copy of {p0} to its file?',
    saveTheWorkingCopyOfToA:
      'Save the working copy of {p0} to a new file {p1}? Unsaved changes in the original document will remain.',
    createANewDocument: 'Create a new document {p0}?{p1}',
    itWillBeACopyOfTemplate:
      ' It will be a copy of template {p0}. The template is unchanged.',
    requestedToolV: 'Requested tool: {p0} · {p1} v{p2}',
    filesAndFoldersToChangeOrCreate: 'Files and folders to change or create',
    newFolder: 'New folder',
    newFile: 'New file',
    overwrite: 'Overwrite',
    pluginNotes: 'Plugin notes',
    beforeWritingTheCurrentContentsOfThese:
      'Before writing, the current contents of these files are saved as checkpoints. After writing, files are read again to verify. Use the Verbex rollback command to restore them. This approval applies to this save once. If the document or files change while approval is pending, saving is blocked.',
    allowThisSave: 'Allow this save',
    deny: 'Deny',
  },
  BrowserApprovalModal: {
    approveOneBrowserAction: 'Approve one browser action',
    checkTheSiteAndOutgoingContentThis:
      'Check the site and outgoing content. This applies to one action. All page-triggered communication cannot be determined in advance, and site changes cannot be undone with Vault undo.',
    actualTargetAndSite: 'Actual target and site',
    exactActionAndOutgoingContent: 'Exact action and outgoing content',
    expectedEffectsPluginDescription: 'Expected effects · plugin description',
    allowThisActionOnly: 'Allow this action only',
    deny: 'Deny',
    approvalExpiresInSeconds: 'Approval expires in {p0} seconds',
    browserActionApprovalExpiredTheActionWas:
      'Browser action approval expired. The action was not executed. Request it again.',
  },
  ToolCatalogControls: {
    groupBy: 'Group by',
    groupByPlugin: 'Group by plugin',
    groupByApprovalStatus: 'Group by approval status',
    approvalStatus: 'Approval status',
    allApprovalStatuses: 'All approval statuses',
  },
  useChatStreamManager: {
    wholeDocumentConversion: 'Whole-document conversion',
    wholeDocumentAnalysis: 'Whole-document analysis',
    confirmLargeDocumentOperation: 'Confirm large document operation',
    processingForWillHandleAboutSections:
      'Processing {p1} for "{p0}" will handle about {p2} sections ',
    sequentiallyRequiringLLMCallsTimeAndCost:
      'sequentially, requiring LLM calls, time, and cost for each.\n\nContinue?',
    continue: 'Continue',
    applyTheItemsThatFailedValidationAs:
      'Apply the items that failed validation as is?',
    automaticValidationRepeatedlyFailedNNN:
      'Automatic validation repeatedly failed:\n\n{p0}\n\n',
    acceptTheCurrentResultWithoutFurtherAttempts:
      'Accept the current result without further attempts to fix it?',
    applyAsIsY: 'Apply as is (Y)',
    evidenceLedgerSearchCandidatesSourceDocumentsReturned:
      'Evidence ledger: {p0} search candidates, {p1} source documents returned by reads (see scope records for review coverage)',
    theModelRepeatedlyReturnedPlainTextInstead:
      'The model repeatedly returned plain text instead of an actual tool_call. ',
    theLastToolResultMayNotHave:
      'The last tool result may not have reached the model. ',
    theAutomaticIterationLimitWasReachedBefore:
      'The automatic iteration limit ({p0}) was reached before the response finished. ',
    toolWasCalledTimesWithTheSame:
      'Tool {p0} was called {p1} times with the same arguments. {p2} Split the request or specify the required values and scope.',
    increaseMaxAutoToolRequestsInSettings:
      'Increase "Max auto tool requests" in settings or continue the conversation.',
    appliedAsIsAfterTheUserAccepted:
      '⚠️ Applied as is after the user accepted validation failure',
  },
}
