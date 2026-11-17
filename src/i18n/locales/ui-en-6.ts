export const ui6 = {
  changeLedger: {
    changeLedgerNoMutationCallsExecutedIn:
      'Change ledger: no mutation calls executed in this turn.',
    applied: 'Applied',
    partiallyApplied: 'Partially applied',
    failedDenied: 'Failed/denied',
    unchangedUnknown: 'Unchanged/unknown',
    applied2: 'Applied',
    partiallyApplied2: 'Partially applied',
    failedDenied2: 'Failed/denied',
    unchangedUnknown2: 'Unchanged/unknown',
    calls: ' {p0} calls',
    andMore: 'and {p0} more',
    changeLedgerMutationCallsInThisTurn:
      'Change ledger: {p0} mutation calls in this turn — {p1}.',
  },
  McpOAuthControls: {
    completeBrowserSignInAndConsentClosing:
      'Complete browser sign-in and consent. Closing settings cancels it.',
    signedInTestTheConnectionToCheck:
      'Signed in. Test the connection to check server tools.',
    oAuthSignInFailed: 'OAuth sign-in failed',
    discoverServiceAuthenticationAndRegisterVerbexThrough:
      'Discover service authentication and register Verbex through DCR. Servers without DCR cannot be used for sign-in. Sign-in credentials are stored in Obsidian Keychain.',
    browserSignInSignInAgain: 'Browser sign-in / sign in again',
    signInCancelled: 'Sign-in cancelled.',
    cancelSignIn: 'Cancel sign-in',
    signInCredentialsDeletedFromThisDevice:
      'Sign-in credentials deleted from this device. Manage consent revocation in the service itself.',
    couldNotDeleteSignInCredentials: 'Could not delete sign-in credentials',
    deleteSignInCredentials: 'Delete sign-in credentials',
  },
  McpConnectionFields: {
    endpointUrl: 'MCP endpoint URL',
    connectionType: 'Connection type',
    remoteMCPURL: 'Remote MCP URL',
    localProgramAdvanced: 'Local program (advanced)',
    enterTheMCPAddressProvidedByThe:
      'Enter the MCP address provided by the service. Remote servers require HTTPS; localhost also supports HTTP.',
    authentication: 'Authentication',
    browserSignInOAuthDCR: 'Browser sign-in · OAuth / DCR',
    none: 'None',
    tokenObsidianKeychain: 'Token · Obsidian Keychain',
    keychainSecret: 'Keychain secret',
    chooseAnExistingTokenOrCreateA:
      'Choose an existing token or create a new entry. Only the entry name is saved in Verbex settings. Reconnect after changing the token.',
    tokenConnectionsRequireSecretStorageInObsidian:
      'Token connections require Secret Storage in Obsidian 1.11.5 or later.',
    oAuthSignInRequiresSecretStorageIn:
      'OAuth sign-in requires Secret Storage in Obsidian 1.11.5 or later.',
    command: 'Command',
    localMCPProgramOrFullExecutablePath:
      'Local MCP program or full executable path',
    arguments: 'Arguments',
    enterOneArgumentPerLineDoNot:
      'Enter one argument per line. Do not wrap arguments in additional quotes.',
    environmentVariablesAdvanced: 'Environment variables (advanced)',
    onlySpecifiedValuesAreAddedToThe:
      'Only specified values are added to the minimal execution environment. Existing local environment variable settings are preserved.',
  },
  PluginConnectorReviewModal: {
    reviewPluginConnector: 'Review plugin connector',
    jSONMustNotExceed150000Characters:
      'JSON must not exceed 150,000 characters.',
    jSONError: 'JSON error',
    atMost32ConnectorsCanBeRegistered:
      'At most 32 connectors can be registered.',
    approvalFailed: 'Approval failed',
    manifestJSON: 'Manifest JSON',
    reviewJSON: 'Review JSON',
    target: 'Target: ',
    connector: ' · connector:',
    agentCalls: 'Agent calls:',
    allowed: 'Allowed',
    off: 'Off',
    resultLimit: 'Result limit: ',
    charactersTimeout: ' characters · timeout ',
    approvalSendsThisMethodSReturnValues:
      "Approval sends this method's return values to the current chat model. Plugin code runs within Obsidian; declarations of read/calculation behavior do not block actual side effects. Synchronous calls may freeze the screen. Timeouts and aborts cannot cancel the target call.",
    ifTheSameIDAlreadyExistsReplace:
      'If the same ID already exists, replace it with this definition and approve the currently installed version.',
    approveAndRegisterReviewedDefinitions:
      'Approve and register reviewed definitions',
    close: 'Close',
  },
  McpServerFormModal: {
    enterAnExecutableCommand: 'Enter an executable command.',
    connectionVerifiedServerToolsToolExecutionRequires:
      'Connection verified: {p0} server tools. Tool execution requires separate approval.',
    couldNotVerifyTheConnection: 'Could not verify the connection.',
    couldNotSaveMCPSettings: 'Could not save MCP settings.',
    invalidJSONSettings: 'Invalid JSON settings.',
    displayName: 'Display name',
    forRemoteConnectionsDefaultsToTheURL:
      'For remote connections, defaults to the URL hostname if omitted.',
    importConnectionSettingsJSONAdvanced:
      'Import connection settings JSON (advanced)',
    importConnectionSettingsUseKeychainEntryNames:
      'Import connection settings. Use Keychain entry names instead of raw HTTP tokens.',
    import: 'Import',
    checkingConnection: 'Checking connection…',
    testConnection: 'Test connection',
  },
}
