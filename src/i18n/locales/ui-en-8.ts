export const ui8 = {
  embeddingActivity: {
    none: 'Embedding index: no update in this session',
    waiting: 'Embedding index: update pending',
    updating: 'Embedding index: updating (chunks {p0}/{p1}, {p2} files)',
    hold: 'Embedding index: update on hold ({p0})',
    runtime_missing: 'local runtime missing',
    configuration: 'needs configuration',
    authentication: 'authentication failed',
    last: 'Last update {p0} · {p1} files',
    failed: ' · failed: {p2} files, {p3} chunks',
    disabled: 'Embedding index: not used (keyword search only)',
    notice: 'Embedding index updated: {p0} files',
    noticeFailed: ' ({p1} failed)',
  },
  ChatView: {
    theVerbexChatViewIsNotReady: 'The Verbex chat view is not ready yet.',
    theVerbexChatViewIsNotReady2: 'The Verbex chat view is not ready yet.',
  },
  skillAvailability: {
    skillExcludedFromThisRequestBecauseRequired:
      "Skill '{p0}': excluded from this request because required plugins ({p1}) are disabled.",
  },
  sessionSources: {
    invalidConversationID: 'Invalid conversation ID.',
  },
  sessionBundle: {
    nNConversationIDNRunningNN:
      '# {p0}\n\nConversation ID: {p1}\nRunning: {p2}\n\n',
  },
  exportSession: {
    enterAnAbsoluteFolderPath: 'Enter an absolute folder path.',
    thisIsNotAFolder: 'This is not a folder.',
    verbexImprovementAnalysisExportNIncludesConversationsTool:
      'Verbex improvement analysis export\nIncludes conversations, tool results, document paths, and quotations. Review before sharing.\nSettings files, original attachments, restore point originals, and embedding databases are not collected.\nShared diagnostics may include anonymized events from other conversations.\nAudit records cover only periods when recording was enabled. Earlier records are not restored.\nA folder without manifest.json is an incomplete export.\n',
    invalidExportFileName: 'Invalid export file name.',
  },
  useChatHistory: {
    verbexInitializationIsNotComplete: 'Verbex initialization is not complete.',
  },
  StatusSnapshotService: {
    requiredPluginsAreDisabled: ' (required plugins are disabled: {p0})',
    inactiveSkills: 'Inactive Skills: {p0}',
  },
  sourceCitation: {
    sourceContentChangedOpeningTheNoteOnly:
      'Source content changed; opening the note only. Search again to locate the passage.',
  },
  useToolCatalog: {
    couldNotCheckToolStatus: 'Could not check tool status',
    couldNotCheckMCPStatus: 'Could not check MCP status',
  },
  providerCatalog: {
    active: 'Active',
    callInProgress: 'Call in progress',
    active2: 'Active',
    callInProgress2: 'Call in progress',
    needsVerification: 'Needs verification',
    approvalRequired: 'Approval required',
    checkingStatus: 'Checking status',
    checkInstallationActivationOrReviewReapproval:
      'Check installation/activation or review/reapproval',
    pluginExposed: 'Plugin-exposed · {p0}',
    pluginExposedEditingAndSavingToolsNot:
      'Plugin-exposed · editing and saving tools not supported yet',
    reviewAndApproveToolDefinitions: 'Review and approve tool definitions',
    externalAPICallsAreDisabled: 'External API calls are disabled',
    tokenChangedOrMissingReconnect: 'Token changed or missing: reconnect',
    connectedApprovalPerCallByDefault:
      'Connected · approval per call by default',
    unsupportedModelToolNameFormat: 'Unsupported model tool name format',
    turnOnAllowExternalApiTools:
      "Turn on 'Allow external API tools' in Verbex settings › Tool management",
    allowExternalAPIsInAgentPermissions:
      'Allow external APIs in agent permissions',
    checkKeychainAndReconnectTheServer:
      'Check Keychain and reconnect the server',
    useLettersNumbersUnderscoresAndHyphensAt:
      'Use letters, numbers, underscores, and hyphens; at most 64 characters',
  },
}
