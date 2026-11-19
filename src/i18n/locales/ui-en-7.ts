export const ui7 = {
  RetrievalEvaluationCollectorModal: {
    generalVaultQuery: 'General vault query',
    scopedQuery: 'Scoped query',
    smallModelNarrowContext: 'Small model / narrow context',
    largeDocumentLongContext: 'Large document / long context',
    collectRetrievalEvaluationData: 'Collect retrieval evaluation data',
    loadedExistingCase: 'Loaded existing case: {p0}',
    enterAQueryFirst: 'Enter a query first.',
    searchingTheCurrentVaultForEvidenceCandidates:
      'Searching the current vault for evidence candidates...',
    loadedEvidenceCandidatesSelectRelevantChunks:
      'Loaded {p0} evidence candidates. Select relevant chunks.',
    searchFailed: 'Search failed: {p0}',
    caseIDAndQueryAreRequired: 'Case ID and query are required.',
    selectAtLeastOneRelevantChunkFrom:
      'Select at least one relevant chunk from the results or enter a unit ID manually.',
    savedCases: 'Saved: {p0} ({p1} cases)',
    saveFailed: 'Save failed: {p0}',
    markTheCorrectEvidenceChunksForEach:
      'Mark the correct evidence chunks for each query and save a golden set for the existing evaluation harness. Only rank, file, line, and body are shown; search scores are omitted.',
    saveLocation: 'Save location: ',
    loadExistingCase: 'Load existing case',
    newCase: 'New case',
    caseID: 'Case ID',
    query: 'Query',
    exampleWhatAreThePilotRollbackConditions:
      'Example: What are the pilot rollback conditions and who approves them?',
    scenario: 'Scenario',
    tokenBudgetOptional: 'token budget (optional)',
    example4096: 'Example: 4096',
    contextKOptional: 'context K (optional)',
    example5: 'Example: 5',
    fileScopeOptionalOnePerLine: 'File scope (optional, one per line)',
    folderScopeOptionalOnePerLine: 'Folder scope (optional, one per line)',
    searching: 'Searching...',
    searchVaultCandidatesUpTo: 'Search vault candidates (up to {p0})',
    newCase2: 'New case',
    selectRelevantEvidence: 'Select relevant evidence',
    checkTheSearchResultChunksNeededTo:
      'Check the search result chunks needed to answer the query. Their unit IDs will be saved as ground truth labels.',
    noSearchResultsYet: 'No search results yet.',
    rank: 'Rank · ',
    addRelevantUnitIDsManuallyOptionalOne:
      'Add relevant unit IDs manually (optional, one per line)',
    currentlySelected: 'Currently selected: ',
    unitsDuplicatesRemovedWhenSaving: ' units (duplicates removed when saving)',
    saving: 'Saving...',
    saveToGoldenSet: 'Save to golden set',
    close: 'Close',
    tokenBudgetMustBeANonnegativeInteger:
      'token budget must be a nonnegative integer.',
    contextKMustBeAnIntegerOf: 'context K must be an integer of at least 1.',
  },
  ToolBadge: {
    toolCandidatesAndReadinessForThisConversation:
      'Tool candidates and readiness for this conversation',
    tools: 'Tools (',
    toolSelectionForThisConversation: 'Tool selection for this conversation',
    registered: 'Registered ',
    ready: '· ready ',
    callCandidates: '· call candidates',
    lastSuccessfulModelRequestExposure:
      'Last successful model request exposure:',
    noneYet: 'None yet',
    pinsSelectCandidatesExecutionApprovalAndSkill:
      'Pins select candidates. Execution approval and Skill/definition token limits still apply.',
    requiredBasicToolsAndToolsRequiredBy:
      'Required basic tools and tools required by active Skills/workflows are retained even when excluded.',
    toolCategory: 'Tool category',
    all: 'All',
    searchConversationTools: 'Search conversation tools',
    searchCapabilitiesAndProviders: 'Search capabilities and providers',
    toolManagement: 'Tool management',
    tools2: ' tools',
    requiredBasicTool: ' · required basic tool',
    selectionForThisConversation: '{p0} selection for this conversation',
    auto: 'Auto',
    pin: 'Pin',
    exclude: 'Exclude',
    noMatchingTools: 'No matching tools.',
  },
}
