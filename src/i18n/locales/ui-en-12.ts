export const ui12 = {
  PlanTracker: {
    understand: 'Understand request',
    respond: 'Write response',
  },
  agentCompletion: {
    validationFailureAcceptedAsIsByThe:
      'Validation failure accepted as is by the user',
    agentRunComplete: 'Agent run complete: {p0}',
    attempts: '{p0} attempts',
    '1Attempt': '1 attempt',
  },
  AgentRunExecution: {
    agentExecutionPlanPreparedCoverage:
      'Agent execution plan prepared: {p0} ({p1} coverage)',
    toolWasNotIncludedInThisRequest:
      'Tool {p0} was not included in this request and could not run. Pin it in the chat tool selector to include it in the next request.',
    removedFilesConsideredUnrelatedToTheCurrent:
      'Removed {p0} files considered unrelated to the current task from context.',
    compactedContextBySummarizingEarlierMessages:
      'Compacted context by summarizing {p0} earlier messages.',
  },
  modelReadiness: {
    noChatModelsAreRegisteredAddA:
      'No chat models are registered. Add a model in settings.',
    theSelectedChatModelCouldNotBe:
      'The selected chat model could not be found (it may have been deleted). Select another model in settings.',
    theSelectedChatModelIsDisabledEnable:
      'The selected chat model "{p0}" is disabled. Enable it again or select another model in settings.',
    theProviderForTheSelectedChatModel:
      'The provider for the selected chat model "{p0}" could not be found (it may have been deleted). Add the provider again or select another model in settings.',
    providerHasNoAPIKeyEnterAn:
      'Provider "{p0}" has no API key. Enter an API key in settings.',
    providerHasNoBaseURLEnterA:
      'Provider "{p0}" has no Base URL. Enter a Base URL in settings.',
    theSelectedChatModelDoesNotSupport:
      'The selected chat model "{p0}" does not support tool calling. Disable tool calling or select a supported model.',
  },
  browserStatusText: {
    running: 'Running',
    executionRecordFound: 'Execution record found',
    noRecordInCurrentProviderNotProof:
      'No record in current provider · not proof of non-execution',
    inputNotSent: 'Input not sent',
    inputSent: 'Input sent',
    inputPartiallySent: 'Input partially sent',
    inputTransmissionUnknown: 'Input transmission unknown',
    inputAppliedExternalOperationSuccessUnverified:
      'Input applied · external operation success unverified',
    inputNotApplied: 'Input not applied',
    inputApplicationUnknown: 'Input application unknown',
    actions: ' {p0}{p1}/{p2} actions',
    recordedSteps: 'recorded steps ',
    recordCode: ' · record code {p0}',
    theProviderRecordedARejectionBeforeExecution:
      ' The provider recorded a rejection before execution and sent no input. Verify that the site is unchanged before unblocking.',
    checkingStatusDoesNotUnblockTheAction:
      '{p0}{p1} Checking status does not unblock the action. Check the site yourself.',
  },
  browserStatus: {
    noUnresolvedActionsFoundForThisConversation:
      'No unresolved actions found for this conversation.',
    providerUnavailableOrAPreviousCallIs:
      'Provider unavailable or a previous call is still running. Check later.',
  },
  descriptorDiff: {
    none: '(none)',
  },
  revealSavedAnchorCandidate: {
    invalidParagraphLocation: 'Invalid paragraph location.',
    noCurrentParagraphCandidates: 'No current paragraph candidates.',
    paragraphLocationRecordsExpired: 'Paragraph location records expired.',
    invalidDocumentPath: 'Invalid document path.',
    approvedHWPHandsIsUnavailable: 'Approved HWP Hands is unavailable.',
    hWPHandsLocationNavigationIsUnavailable:
      'HWP Hands location navigation is unavailable.',
    locationNavigationCancelledOrThePluginIs:
      'Location navigation cancelled or the plugin is busy.',
    stateChangedBeforeLocationNavigation:
      'State changed before location navigation.',
    stateChangedDuringLocationNavigationCheckThe:
      'State changed during location navigation. Check the document view.',
  },
  resolveSavedAnchorRefs: {
    invalidParagraphLocationRange: 'Invalid paragraph location range.',
  },
  resolveSavedAnchorCandidates: {
    invalidParagraphLocationRange: 'Invalid paragraph location range.',
    paragraphLocationRecordsExpired: 'Paragraph location records expired.',
    noParagraphLocationsToCheck: 'No paragraph locations to check.',
    approvedHWPHandsIsUnavailable: 'Approved HWP Hands is unavailable.',
    hWPHandsOpenDocumentInspectionIsUnavailable:
      'HWP Hands open document inspection is unavailable.',
    hWPHandsQueryCancelledOrBusy: 'HWP Hands query cancelled or busy.',
    hWPHandsChanged: 'HWP Hands changed.',
    vaultChangesWereObservedDuringTheQuery:
      'Vault changes were observed during the query. Their cause is unknown.',
    vaultChangesWereObservedDuringTheQuery2:
      'Vault changes were observed during the query. Their cause is unknown.',
    hWPHandsStateChangedDuringTheQuery:
      'HWP Hands state changed during the query.',
    paragraphCandidatesDoNotMatchTheSave:
      'Paragraph candidates do not match the save records or open document.',
  },
  resolveAnchorBatch: {
    paragraphLocationRecordsExpired: 'Paragraph location records expired.',
    noParagraphLocationsToCheck: 'No paragraph locations to check.',
    approvedKORDOCIsUnavailable: 'Approved KORDOC is unavailable.',
    kORDOCParagraphReferenceVerificationIsUnavailable:
      'KORDOC paragraph reference verification is unavailable.',
    kORDOCQueryCancelledOrBusy: 'KORDOC query cancelled or busy.',
    kORDOCChanged: 'KORDOC changed.',
    vaultChangesWereObservedDuringTheQuery:
      'Vault changes were observed during the query. Their cause is unknown.',
    vaultChangesWereObservedDuringTheQuery2:
      'Vault changes were observed during the query. Their cause is unknown.',
    kORDOCStateChangedDuringTheQuery: 'KORDOC state changed during the query.',
    paragraphReferencesDoNotMatchTheSave:
      'Paragraph references do not match the save records.',
  },
  editorReveal: {
    thisPluginDoesNotSupportLocationNavigation:
      'This plugin does not support location navigation.',
    thePluginChangedOrAPreviousCall:
      'The plugin changed or a previous call is still running. Try again shortly.',
    thePluginChangedWhileOpeningTheLocation:
      'The plugin changed while opening the location. Check the document.',
  },
  documentJobNotice: {
    hWPXFormatJobBlocked: 'HWPX format job blocked ({p0}). {p1}',
  },
}
