export const ui1 = {
  McpApprovalModal: {
    approveMCPCall: 'Allow this call to an external tool?',
    confirmAutomaticMCPApproval: 'Always allow this external tool?',
    thisToolSendsArgumentsToAnExternal:
      'This tool sends the content below to an external server or a program on this computer, and may change services or files there. Verbex cannot undo what an external tool changes outside this vault. Results may later be sent to the AI model service you set up.',
    argumentsToSend: 'Content to send',
    reviewToolDefinition: 'Details',
    automaticApprovalAppliesToAllFutureArguments:
      'Automatically allowing applies to everything this tool sends from now on. Verbex asks again if the server settings or the tool description change.',
    allowThisCall: 'Allow this call',
    automaticallyAllowThisTool: 'Automatically allow this tool',
    deny: "Don't allow",
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
      'Discard the AI changes to {p0} from the copy being edited? The original file is unchanged.',
    cancel: 'Cancel',
    discard: 'Discard',
  },
  CommitApprovalModal: {
    approveDocumentSave: 'Allow saving this document?',
    approveSaveAs: 'Allow saving as a new file?',
    approveNewDocument: 'Allow creating this document?',
    saveTheWorkingCopyOfToIts:
      'This saves the copy of {p0} being edited to its file.',
    saveTheWorkingCopyOfToA:
      'This saves the copy of {p1} being edited as a new file: {p0}. Unsaved changes in the original document stay as they are.',
    createANewDocument: 'This creates a new document: {p0}{p1}',
    itWillBeACopyOfTemplate:
      '\nTemplate used: {p0}. The template is not changed.',
    requestedToolV: 'Requested tool: {p0} · {p1} v{p2}',
    filesAndFoldersToChangeOrCreate: 'Files and folders to change or create',
    newFolder: 'New folder',
    newFile: 'New file',
    overwrite: 'Overwrite',
    pluginNotes: 'Plugin notes',
    temporaryWorkingFiles: 'Temporary files ({count}), removed afterwards',
    beforeWritingTheCurrentContentsOfThese:
      'Files that will change get a restore point before saving. To undo the save, run "{command}" from the command palette. This applies to this one save, and nothing is saved if a file changes while this dialog is open.',
    newFilesOnly:
      'This creates new files and overwrites nothing. To remove them afterwards, run "{command}" from the command palette (files changed after creation are left alone). This applies to this one creation, and nothing is created if a file appears at the same path while this dialog is open.',
    allowThisSave: 'Allow this save',
    allowCreating: 'Allow creating',
    deny: "Don't allow",
  },
  BrowserApprovalModal: {
    approveOneBrowserAction: 'Allow this browser action?',
    checkTheSiteAndOutgoingContentThis:
      'Check the site and what is being sent. This allows one action only. Verbex cannot know in advance everything the page will send, and changes on the site cannot be undone with Vault undo.',
    actualTargetAndSite: 'Actual target and site',
    exactActionAndOutgoingContent: 'Exact action and outgoing content',
    expectedEffectsPluginDescription: 'Expected effects · plugin description',
    allowThisActionOnly: 'Allow this action only',
    deny: "Don't allow",
    site: 'Site: {site}',
    action: 'Action: {action}',
    contentBeingSent: 'Content being sent: {content}',
    details: 'Details',
    approvalExpiresInSeconds: 'You can allow this for {p0} more seconds',
    browserActionApprovalExpiredTheActionWas:
      'The time to allow this browser action expired. The action was not run. Request it again.',
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
