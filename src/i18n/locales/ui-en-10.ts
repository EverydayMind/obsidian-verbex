export const ui10 = {
  apiPresets: {
    aPIReady: 'API ready',
    notInstalled: 'Not installed',
    disabled: 'Disabled',
    aPINotReadyCheckCompatibility: 'API not ready / check compatibility',
    calculateTaskLineStatusRequiresRegistrationAnd:
      'Calculate task line status. Requires registration and API review approval; file changes require separate Diff approval.',
    providesDQLQueriesAndBlockRenderingConnects:
      'Provides DQL queries and block rendering. Connects enabled APIs automatically. Does not run dataviewjs.',
    useHWPXDocumentBlockInspectionAndEditing:
      'Use HWPX document/block inspection and editing proposals from registered providers. Applying changes requires proposal approval and a checkpoint.',
  },
  toolCallSummary: {
    awaitingApproval: 'Awaiting approval',
    executionDenied: 'Execution denied',
    running: 'Running',
    completed: 'Completed',
    error: 'Error',
    aborted: 'Aborted',
    pending: 'Pending',
    fileReadCompleteCharacters: 'File read complete: {p0} ({p1} characters)',
    noPath: '(no path)',
    readFile: 'Read file ({p0}): {p1}',
    noPath2: '(no path)',
    noFolder: '(no folder)',
    folderReadComplete: 'Folder read complete: {p0}',
    folderReadCompleteItems: 'Folder read complete: {p0} ({p1} items)',
    readFolder: 'Read folder ({p0}): {p1}',
    noFolder2: '(no folder)',
    fileListLoadedItems: 'File list loaded: {p0} ({p1} items)',
    entireVault: 'Entire vault',
    listFiles: 'List files ({p0}): {p1}',
    entireVault2: 'Entire vault',
    noteListLoadedItems: 'Note list loaded: {p0} ({p1} items)',
    entireVault3: 'Entire vault',
    listNotes: 'List notes ({p0}): {p1}',
    entireVault4: 'Entire vault',
    folderTreeBuiltFolders: 'Folder tree built: {p0} ({p1} folders)',
    entireVault5: 'Entire vault',
    folderTree: 'Folder tree ({p0}): {p1}',
    entireVault6: 'Entire vault',
    frontmatterReadComplete: 'Frontmatter read complete: {p0}',
    noPath3: '(no path)',
    readFrontmatter: 'Read frontmatter ({p0}): {p1}',
    noPath4: '(no path)',
    linksParsedLinks: 'Links parsed: {p0} ({p1} links)',
    noPath5: '(no path)',
    parseLinks: 'Parse links ({p0}): {p1}',
    noPath6: '(no path)',
    vaultSearchCompleteResults: 'Vault search complete: "{p0}" ({p1} results)',
    vaultSearch: 'Vault search ({p0}): "{p1}"',
    semanticSearchCompleteResults:
      'Semantic search complete: "{p0}" ({p1} results)',
    semanticSearch: 'Semantic search ({p0}): "{p1}"',
    vaultGraphLoadedEdges: 'Vault graph loaded: {p0} ({p1} edges)',
    entireVault7: 'Entire vault',
    vaultGraph: 'Vault graph ({p0}): {p1}',
    entireVault8: 'Entire vault',
    contextCompacted: 'Context compacted: {p0}',
    contextCompaction: 'Context compaction ({p0})',
    toolCompleteResultLines: 'Tool complete: {p0} ({p1} result lines)',
    toolExecution: 'Tool execution ({p0}): {p1}',
  },
  skillDiagnosticNotice: {
    couldNotLoadSkills: 'Could not load Skills: {p0}',
  },
  runStateOnError: {
    aborted: 'Aborted',
    stoppedByError: 'Stopped by error',
  },
  largeFileCard: {
    analyzeBySection: 'Analyze by section',
    synthesize: 'Synthesize',
    crossCheck: 'Cross-check',
    convertBySection: 'Convert by section',
    largeDocumentConversion: 'Large document conversion',
    wholeDocumentAnalysis: 'Whole-document analysis',
  },
  formatAgentErrorForUser: {
    theInputDocumentExceedsTheModelS:
      "The input document exceeds the model's processing limit. Split it into sections or use a large document operation.",
    requiredInputExceedsTheModelBudgetAbout:
      'Required input exceeds the model budget (about {p0} / {p1} tokens). Reduce the scope or choose a larger model.',
    contextStillExceedsTheLimitAfterSafe:
      'Context still exceeds the limit after safe reduction (about {p0} / {p1} tokens). Narrow the request or read only the required sections.',
    modelIsNotConfiguredToSupportTool:
      'Model "{p0}" is not configured to support tool calling. Enable tool calling or choose a supported model.',
    anUnknownErrorOccurredWhileGeneratingThe:
      'An unknown error occurred while generating the response.',
  },
  browserRuntime: {
    browserActionApprovalExpiredTheActionWas:
      'Browser action approval expired. The action was not executed. Request it again.',
    checkUnresolvedBrowserActions: 'Check unresolved browser actions',
    checkTheActionResultOnTheSite:
      'Check the action result on the site yourself. The button below only removes the retry block and does not prove the external operation succeeded.',
    refreshProviderStatus: 'Refresh provider status',
    checkingProviderStatus: 'Checking provider status.',
    couldNotCheckStatusCheckTheSite:
      'Could not check status. Check the site yourself. Automatic retry is disabled.',
    iCheckedTheSiteUnblock: 'I checked the site · unblock',
    thisActionIsRunningOrHasAlready:
      'This action is running or has already been unblocked. Reopen the dialog to check.',
    waitingForTheActionResponseItCannot:
      'Waiting for the action response. It cannot be unblocked while running.',
    noUnresolvedActions: 'No unresolved actions.',
  },
}
