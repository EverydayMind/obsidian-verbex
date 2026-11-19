export const ui5 = {
  PluginConnectorSection: {
    couldNotCheckStatus: 'Could not check status',
    obsidianPluginAPI: 'Obsidian plugin API',
    connectReadAndCalculationAPIsToThe:
      'Connect read and calculation APIs to the chat agent. After approval, select tools using Skills, keywords, or conversation pins.',
    advancedImportCustomDefinitions: 'Advanced · import custom definitions',
    importJSON: 'Import JSON',
    checkingStatus: 'Checking status',
    enableConnector: 'Enable connector',
    reviewReapprove: 'Review / reapprove',
    exportJSON: 'Export JSON',
    removeRegistration: 'Remove registration',
    enableTool: 'Enable tool',
    allowAgentCalls: 'Allow agent calls',
    copyTheJSONToExport: 'Copy the JSON to export',
  },
  PluginApiPresets: {
    supportedPresets: 'Supported presets',
    aPIIsConnectedAutomaticallyPinItIn:
      '{p0} API is connected automatically. Pin it in the chat tool selector.',
    installAndEnableInObsidianSettingsCommunity:
      'Install and enable {p0} in Obsidian Settings → Community plugins. It appears automatically in tool management when ready.',
    reviewReapprove: 'Review / reapprove',
    addReviewTasks: 'Add/review Tasks',
    checkConnectionStatus: 'Check connection status',
    installationAndActivationHelp: 'Installation and activation help',
    installationAndActivationAreSeparateFromAPI:
      'Installation and activation are separate from API connection and call approval. Supported presets: Tasks, Dataview, KORDOC.',
  },
  NativeSequentialApproval: {
    tools: ' · tools ',
    tools2: ' tools · ',
    awaitingApproval: 'Awaiting approval',
    reapprove: 'Reapprove',
    savePermissionCommitGrantAndDisabledTool:
      "Approving does not turn on save tools. Turn them on under 'Allow Vault save tools' after approval.",
    approve: 'Approve',
    skip: 'Skip',
    stop: 'Stop',
    reviewToolApproval: 'Review tool approval',
    batchToolApproval:
      'Approve plugin tools ({plugins} plugins · {tools} tools)',
    batchToolApprovalPluginsOnly: 'Approve plugin tools ({plugins} plugins)',
    approved: 'Approved ',
    skipped: ' · skipped ',
    changed: ' · changed ',
    failed: ' · failed ',
  },
  NativeReapprovalReview: {
    approvedPluginVersion: 'Approved plugin version: ',
    currentVersion: ' · current version:',
    approvedFileSHA256: 'Approved file SHA-256: ',
    currentFileSHA256: 'Current file SHA-256: ',
    itemsChangedFromThePreviousDefinition:
      'Items changed from the previous definition: ',
    items: ' items',
    previous: 'Previous',
    current: 'Current',
    someDetailsWereOmittedReviewTheFull:
      'Some details were omitted. Review the full tool definitions.',
    previousApprovedDefinitionsAreMissingOrUnverified:
      'Previous approved definitions are missing or unverified, so changes cannot be compared. Review all current definitions.',
    fullRawDefinitions: 'Full raw definitions',
    approvalRecords: 'Approval records: ',
    duplicatesPreventToolUseRevokeAllApproval:
      ' duplicates prevent tool use. Revoke all approval records for this plugin below, then review and approve the tool definitions again. Disabled tools and executable hashes must also be configured again.',
    revokeAllDuplicateApprovals: 'Revoke all duplicate approvals',
    revokeApproval: 'Revoke approval',
  },
  NativeProviderSection: {
    toolDiscoveryFailed: 'Tool discovery failed',
    toolsExposedByPlugins: 'Tools exposed by plugins',
    toolsExposedByEnabledPluginsAvailableTo:
      "Tools exposed by enabled plugins. Available to the chat agent only while approved definitions and versions are unchanged. Tools run in the plugin's code within Obsidian. Effect labels are plugin declarations and do not provide isolation. Tool results are sent to the current LLM provider.",
    optionalExecutableHashesCheckChangesToMain:
      'Optional executable hashes check changes to main.js on disk. They do not isolate or verify code already loaded into memory or behavior within the same process.',
    openDocumentProtectionUsesDocumentListsFrom:
      'Open document protection uses document lists from approved, active editing plugins. It does not apply to plugins awaiting approval or reporting errors.',
    allowBrowserActionsApproveEachCall:
      'Allow browser actions (approve each call)',
    checkingPluginTools: 'Checking plugin tools…',
    noPluginsExposeTools: 'No plugins expose tools.',
    review: 'Review ',
    tools: ' tools',
    enableTool: 'Enable tool',
    approveTheToolDefinitionsAbove: 'Approve the tool definitions above',
    existingConnector: 'Existing connector ',
    isAlsoEnabledDisableThisConnectorTo:
      ' is also enabled. Disable this connector to use only the tools exposed by the plugin?',
    disableConnector: 'Disable connector',
    enabled: 'Enabled',
    saveToolsOffNotice:
      "{count} save tool(s) of this plugin are off. To let it create or save files, turn them on under 'Allow Vault save tools' below.",
  },
  NativeProviderDefinition: {
    effectSummary:
      '{r} read-only tool(s), {w} tool(s) that can make changes (edit, save, or act)',
    browserActionApproveEachCall: 'Browser action (approve each call)',
    read: 'Read',
    calculate: 'Calculate',
    editWorkingCopy: 'Edit working copy',
    saveToVaultSeparatePermissionAndPer:
      'Save to Vault (separate permission and per-call approval)',
    usageSentToTheModelOriginalText:
      'Usage sent to the model (original text provided by plugin):',
  },
  NativeCommitGrantControls: {
    toolDefinitionsOrApprovalChangedCheckAgain:
      'Tool definitions or approval changed. Check again.',
    couldNotUpdateSaveToolPermission: 'Could not update save tool permission',
    allowVaultSaveTools: 'Allow Vault save tools',
    separateFromToolDefinitionApprovalEachSave:
      'Separate from tool definition approval. Each save requires approval and a checkpoint.',
    saveToolPermissionIsDisabledInThis:
      'Save tool permission is disabled in this build pending validation of the existing acceptance gates.',
    theDefinitionChangedAndThePreviousSave:
      'The definition changed and the previous save permission is inactive. Reapproval alone does not restore it.',
  },
  NativeArtifactControls: {
    couldNotVerifyExecutable: 'Could not verify executable',
    fileOrApprovalSettingsChangedCheckAgain:
      'File or approval settings changed. Check again.',
    couldNotPinExecutable: 'Could not pin executable',
    pinnedFileSHA256: 'Pinned file SHA-256: ',
    checkExecutableHash: 'Check executable hash',
    currentFileSHA256: 'Current file SHA-256: ',
    pinThisHash: 'Pin this hash',
    cancel: 'Cancel',
  },
}
