export const ui4 = {
  DocumentIndexSettings: {
    kORDOCLastChecked: 'KORDOC {p0} · {p1} · {p2} · last checked {p3}',
    noExtractor: 'No extractor',
    none: 'None',
    couldNotCheckExtractionStatus: 'Could not check extraction status',
    localHWPHWPXPDFSearch: 'Local HWP/HWPX/PDF search',
    extractDiskDocumentsWithKORDOCAndInclude:
      'Extract disk documents with KORDOC and include them in BM25. Originals and sidecars are unchanged.',
    hWPHWPXPDFEmbeddings: 'HWP/HWPX/PDF embeddings',
    sendDocumentBodiesToTheSelectedEmbedding:
      'Send document bodies to the selected embedding service. Consent is separate from local search.',
    sendDocumentBodiesToTheLocalEmbedding:
      'Send document bodies to the local embedding service. About {p0} chunks',
    consentToHWPHWPXDocumentEmbeddings:
      'Consent to HWP/HWPX document embeddings',
    documentBodiesWillBeSentToAn:
      'Document bodies will be sent to an external embedding service.\nCurrent document status: {p0} · {p1} chunks\nEach extracted chunk may incur embedding costs.',
    index: '{p0} index',
    hWPHWPXDocumentIncludePaths: 'HWP/HWPX document include paths',
    hWPHWPXDocumentExcludePaths: 'HWP/HWPX document exclude paths',
    enterVaultRelativePathsOrGlobPatterns:
      'Enter Vault-relative paths or glob patterns, one per line. The shared search scope also applies.',
    automaticHWPHWPXExtractionSizeLimitMB:
      'Automatic HWP/HWPX extraction size limit (MB)',
    documentsExceedingTheLimitRequireManualRe:
      'Documents exceeding the limit require manual re-extraction. KORDOC has an absolute limit of 100MB.',
    automaticDocumentExtractionPageLimit:
      'Automatic document extraction page limit',
    hWPHWPXDocumentExtractionStatus: 'HWP/HWPX document extraction status',
    checkExtractorAvailabilityAndCountsByDocument:
      'Check extractor availability and counts by document status.',
    processing: 'Processing…',
    checkStatus: 'Check status',
    reExtractFailedDocuments: 'Re-extract failed documents',
  },
  McpSection: {
    collapse: 'Collapse',
    expand: 'Expand',
    afterConnectingPinToolsInChatOr:
      'After connecting, pin tools in chat or select candidates through Skills and requests. Approval is required per call by default; automatic approval must be explicitly enabled per tool.',
    reconnectMCP: 'Reconnect MCP',
    reconnect: 'Reconnect',
    automaticExecution: '{p0} automatic execution',
    couldNotUpdateMCPAutomaticApproval:
      'Could not update MCP automatic approval',
    reviewTargetAndApproveAgain: 'Review target and approve again',
  },
  VerbexPlaceholderSection: {
    thisSettingIsEnabledIn: 'This setting is enabled in ',
    currentlyAPreview: '. (Currently a preview)',
  },
  useNativeBatchApproval: {
    approvalSettingsChangedReviewAgain:
      'Approval settings changed. Review again.',
    couldNotRevokeApproval: 'Could not revoke approval',
    approvalSettingsChangedReviewAgain2:
      'Approval settings changed. Review again.',
    couldNotUpdateApprovalSettings: 'Could not update approval settings',
    approvalSettingsChangedReviewAgain3:
      'Approval settings changed. Review again.',
    approvalFailed: 'Approval failed',
  },
  ToolManagementSection: {
    toolManagement: 'Tool management',
    registered: 'Registered ',
    ready: '· ready ',
    agentCandidates: '· agent candidates',
    lastSuccessfulModelRequestExposure:
      'Last successful model request exposure:',
    noneYet: 'None yet',
    toolsActuallySentToTheModelDepend:
      'Tools actually sent to the model depend on conversation selection, Skills, readiness, and the definition token budget. Execution approval is applied separately from candidate selection.',
    toolApproval: 'Tool approval',
    toolCategory: 'Tool category',
    all: 'All',
    searchTools: 'Search tools',
    searchCapabilitiesAndProviders: 'Search capabilities and providers',
    enableToolsForChatAgent: 'Enable tools for chat agent',
    showing: 'Showing ',
    tools: ' tools ·',
    groups: ' groups',
    tools2: ' tools',
    noMatchingTools: 'No matching tools.',
    addPluginAPI: 'Add plugin API',
    manageMCPServersAndPermissions: 'Manage MCP servers and permissions',
    noMCPServersRegistered: 'No MCP servers registered.',
    manageVaultSearchOnSearchTab:
      'Manage keyword, semantic, and hybrid Vault search and indexes on the Search tab of Verbex settings. Falls back to keyword search if semantic search fails. Bases rendering works without enabling the Bases core plugin.',
    manageKeywordSemanticAndHybridVaultSearch:
      'Manage keyword, semantic, and hybrid Vault search and indexes in search settings. Falls back to keyword search if semantic search fails. Bases rendering works without enabling the Bases core plugin.',
  },
  ToolGroupTable: {
    details: '{p0} details',
    details2: 'Details',
    externalServer: 'External server',
    community: 'Community',
    obsidianPublicAPIVerbex: 'Obsidian public API / Verbex',
    vaultChangesPermissionCheckDiffProposalApproval:
      'Vault changes: permission check → Diff/proposal approval → restore point → apply',
    editsTheWorkingCopyOfAnOpen:
      'Edits an open document before it is saved. Saving a file requires a separate save tool and save permission.',
    readAndCalculationResultsMayLaterBe:
      'Read and calculation results may later be sent to the LLM provider.',
    executionApprovalIsRequiredForEachCall:
      'Execution approval is required for each call.',
    executionIsAutomaticallyAllowed: 'Execution is automatically allowed.',
    advancedDefinitions: 'Tool description details',
    groupTools: 'group tools',
    tool: 'Tool',
    provider: 'Provider',
    readiness: 'Readiness',
    definitionApproval: 'Definition approval',
    changes: 'Changes',
    details3: 'Details',
  },
  RAGSection: {
    collectRetrievalEvaluationData: 'Collect retrieval evaluation data',
    markRealVaultQueriesAndRelevantEvidence:
      'Mark real vault queries and relevant evidence chunks to create a RetrievalEvaluationCase golden set.',
    openCollector: 'Open collector',
  },
}
