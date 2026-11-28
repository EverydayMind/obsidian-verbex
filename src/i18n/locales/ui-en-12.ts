export const ui12 = {
  LexicalMenu: {
    typeaheadMenu: 'Typeahead menu',
  },
  ApplyTargetModal: {
    omissionWarning:
      'This block is a partial excerpt (omission markers). Replacing an entire existing note is blocked.',
    omissionError: {
      replace:
        'A block with omission markers cannot replace an entire existing note.',
      section:
        'The section cannot be applied because it contains an internal omission marker.',
      empty: 'There is no content to apply after removing omission markers.',
    },
    title: 'Apply draft to note',
    mode: 'Apply mode',
    existing: 'Existing note with Diff review',
    newNote: 'New note',
    how: 'How to apply',
    append: 'Append draft to the end',
    replace: 'Replace the whole note',
    section: 'Replace one Markdown section',
    heading: 'Section heading',
    headingPlaceholder: 'Analysis results',
    path: 'Target note path',
    appendDesc:
      'The draft will be added to the end of this note. The Diff review shows only the appended block.',
    sectionDesc:
      'Only the matching Markdown heading section will be replaced and shown in Diff review.',
    replaceDesc:
      'The whole note will be replaced by this draft. The Diff review shows the full-file replacement before writing.',
    chooseExisting: 'Choose an existing Markdown note to continue.',
    alreadyExists:
      'That note already exists. Switch to existing-note mode or choose a new path.',
    newDesc: 'A new Markdown note will be created directly from this draft.',
  },
  AssistantMessageAnnotations: {
    sources: 'View Sources ({p0})',
  },
  AssistantMessageReasoning: {
    reasoning: 'Reasoning',
  },
  AuditTracePanel: {
    contextAudit: 'Context audit ({p0} turns)',
    turn: 'Turn {p0}',
    events: '{p0} aggregate events',
  },
  ImageUploadButton: {
    image: 'Image',
  },
  MentionableBadge: {
    currentFile: ' (Current File)',
  },
  CreateTemplatePopoverPlugin: {
    createTemplate: 'Create template',
  },
  UserMessageActions: {
    copyMessage: 'Copy message',
    queryInformation: 'Query Information',
    model: 'Model:',
    attachedContext: 'Attached context:',
    skills: 'Skills:',
    workflow: 'Workflow:',
    none: 'None',
    viewDetails: 'View details',
  },
  LLMResponseInfoPopover: {
    information: 'LLM Response Information',
    tokenCount: 'Token Count',
    input: 'Input:',
    output: 'Output:',
    total: 'Total:',
    estimatedPrice: 'Estimated Price:',
    notAvailable: 'Not available',
    noUsage: 'Usage statistics are not available for this model',
  },
  MarkdownCodeComponent: {
    expand: 'Expand content block',
    collapse: 'Collapse content block',
    viewRaw: 'View Raw Text',
    viewFormatted: 'View Formatted',
    copied: 'Copied',
    copy: 'Copy',
    applying: 'Applying...',
  },
  SkillContextResults: {
    count: 'Skills ({p0}/{p1})',
    empty: 'No skills in context',
    resend: 'Resend with selected context',
  },
  WorkflowContextResults: {
    count: 'Workflows ({p0}/{p1})',
    empty: 'No workflows in context',
  },
  ChatListDropdown: {
    history: 'Chat History',
    empty: 'No conversations',
  },
  VerbexDiffReview: {
    previousRejections:
      'You have already rejected changes to this file during this request. Rejections: {p0}.',
    explicitApproval: 'Verbex asks before changing this file.',
    diffRequired: 'Look over the changes before they are applied.',
    tidyApproval: 'Verbex always asks before a note tidy change.',
    starterSkillApproval:
      'Verbex always asks before replacing a default Skill copy.',
    autoApproval: 'Automatic mode: applied after a countdown you can cancel.',
    sessionTrust: 'Allowed for this conversation.',
    destructiveApproval:
      'This change empties the file or removes most of it, so this also removes the content that was there. Verbex asks before applying it.',
    lostLinesApproval:
      'This change removes existing lines and requires your approval.',
    lostLinesCount:
      'This change removes {p0} existing lines and requires your approval.',
    lostLinesCapped:
      'The comparison limit was reached, so the count may be incomplete.',
    create: 'Create',
    body: 'Body',
    frontmatter: 'Properties',
    rename: 'Rename',
    move: 'Move',
    delete: 'Delete',
    link: 'Link',
    highRisk: 'High-risk change; Verbex asks before applying it',
    countdown: 'Automatic mode: applying in {p0}s',
    reviewManually: 'Review manually',
    wholeChange: 'Whole change',
    preview: 'Preview applied result',
    applySelected: 'Apply selected',
    includeChange: 'Include this change',
  },
  VerbexBatchDiffReview: {
    selected: '{p0} of {p1} changes selected',
    rejectAll: 'Reject all',
    highRisk: 'High risk',
    exclude: 'Exclude this file',
  },
  VerbexDiffModal: {
    title: 'Review changes: {p0}',
  },
  VerbexBatchDiffModal: {
    title: 'Review changes ({p0})',
  },
  ApplyViewRoot: {
    fileChanged:
      'The file changed while the diff was open. No changes were applied.',
    failed: 'Apply failed: {p0}',
    applying: 'Applying: {p0}',
    previousDiff: 'Previous diff',
    nextDiff: 'Next diff',
    position: '{p0} of {p1}',
    acceptChanges: 'Accept changes',
    accept: 'Accept',
    cancelApply: 'Cancel apply',
    acceptIncoming: 'Accept Incoming',
    acceptCurrent: 'Accept Current',
    acceptBoth: 'Accept Both',
  },
  ErrorModal: {
    openSettings: 'Open Settings',
  },
  InstallerUpdateRequiredModal: {
    title: 'Verbex Requires Obsidian Update',
    description:
      "Verbex requires a newer version of the Obsidian installer. Please note that this is different from Obsidian's in-app updates. You must manually download the latest version of Obsidian to continue using Verbex.",
    openDownload: 'Open Download Page',
  },
  DotLoader: {
    loading: 'Loading',
  },
  SplitButton: {
    showMore: 'Show more options',
  },
  StatusViewRoot: {
    pluginToolStates:
      'Plugin tools: active {active} · waiting {pending} · reapproval {reapproval} · disabled {disabled}',
    approvalBanner: '{count} plugin(s) waiting for tool approval',
    approvalBreakdown: ' ({pending} waiting, {reapproval} need reapproval)',
    approvalReview: 'Review',
    approvalDismiss: 'Dismiss',
    bm25Only: 'Search method is BM25 only',
    notUsed: 'not used',
    contentBytes: 'content {p0}',
    vectorBytes: 'vector {p0}',
    metadataBytes: 'metadata {p0}',
    tableBytes: 'table {p0}',
    indexBytes: 'indexes {p0}',
    excluded: ' (excluded)',
    adHoc: 'ad-hoc',
    noWorkflow: 'no workflow',
    documents: '{p0} docs',
    notBuilt: 'not built',
    chunks: '{p0} chunks',
    contextBudget:
      '{p0}% of the auto-context budget · excludes the conversation transcript and tool schemas',
  },
  ChatUserInput: {
    contextAuto: 'Context: Auto',
    contextFull: 'Context: Full',
    contextCatalog: 'Context: Catalog',
    contextOff: 'Context: Off',
  },
  TemplateFormModal: {
    addTitle: 'Add Template',
    editTitle: 'Edit Template',
    enterContent: 'Please enter a content for your template',
    enterName: 'Please enter a name for your template',
    created: 'Template created: {p0}',
    updated: 'Template updated: {p0}',
    duplicate: 'A template with this name already exists',
    createFailed: 'Failed to create template',
    loadFailed: 'Failed to load template. Please try again.',
    name: 'Name',
    nameDesc: 'The name of the template',
    content: 'Template Content',
    contentDesc: 'Content of the template',
  },
  VerbexRuntimeSections: {
    auto: 'Auto (planner decides)',
    full: 'Full context bodies',
    catalog: 'Catalog references only',
    off: 'Off (tools only)',
    firstTurnMode: 'First-turn context mode',
    firstTurnModeDesc:
      'Choose who controls automatic retrieval for the first turn. Auto lets the planner select full, catalog, or off; explicit attachments, digests, and workflow grounding remain protected.',
    catalogTokenBudget: 'Catalog token budget',
    catalogTokenBudgetDesc:
      'Maximum estimated tokens for bodyless retrieval candidates in catalog mode.',
    catalogCandidateLimit: 'Catalog candidate limit',
    catalogCandidateLimitDesc:
      'Maximum number of bodyless candidate references shown in catalog mode.',
  },
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
    keychainMissing:
      'The keychain has no API key for this provider. Open the provider in Settings → Verbex and enter the key again.',
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
    bodyBefore: 'Previous body (compared by hash only)',
    bodyChanged: 'Skill body changed',
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
  RecordCleanupModal: {
    title: 'Clean up stored records',
    open: 'Clean up stored records',
    intro:
      'Deletes records that build up while you use Verbex. Skills, prompts, workflows, settings and search indexes are not deleted.',
    chats: 'Chat history',
    chatsDesc: 'The conversations shown in the chat history list.',
    runs: 'Run records',
    runsDesc:
      'Progress records kept for each conversation. Without them, work in an old conversation may not be resumable.',
    checkpoints: 'Rollback points',
    checkpointsDesc:
      'Earlier copies of files kept so a change can be undone. Without them, that change can no longer be undone.',
    jobs: 'Large document job journals',
    jobsDesc:
      'Progress records kept when a large document is processed in pieces.',
    backups: 'Backup copies',
    backupsDesc:
      'Copies kept when saving the search index failed, and copies of the old chat storage kept when it was moved.',
    scope: 'What to delete from {p0}',
    scopeAll: 'Everything',
    scopeOlderThan: 'Older than {p0} days',
    amount: '{p0} items · {p1}',
    stored: 'Stored: {p0}',
    willDelete: 'to delete: {p0}',
    keptNote:
      'Conversations open now, records changed in the last hour and rollback points that are not settled are never deleted ({p0} now).',
    confirm:
      'The selected records ({p0}) will be deleted permanently. They do not go to the trash and cannot be restored.',
    delete: 'Delete selected records ({p0})',
    deleteForever: 'Delete permanently',
    deleting: 'Deleting…',
    close: 'Close',
    done: 'Deleted: {p0}',
    doneWithLeftovers:
      'Deleted: {p0}. {p1} items changed in the meantime or could not be deleted, and were left.',
    scanning: 'Checking records…',
    scanFailed: 'Could not check records: {p0}',
  },
  StarterAssets: {
    banner:
      'The default skills, workflows and prompts are not installed yet. You can choose which sets to install.',
    choose: 'Choose and install',
    dismiss: 'Dismiss this notice',
    command: 'Install default skills, workflows and prompts',
    title: 'Install default skills, workflows and prompts',
    intro:
      'These sets ship with Verbex. Choose the ones you want. Files that already exist are not changed.',
    writing: 'Writing',
    writingDesc:
      'Reports, summaries, meeting minutes, polishing, yearly work summaries, and the report workflow.',
    obsidian: 'Using Obsidian',
    obsidianDesc:
      'Bases, Canvas, Tasks and Templater, vault tidying, merging and splitting files, and authoring skills and workflows.',
    documents: 'HWP and slides',
    documentsDesc:
      'Choosing HWP document tools, one-page HWP summaries and report-plus-deck bundles. The skills for HWP co-editing, HWPX writing, format reuse, slide decks and web tables come from the companion plugins themselves.',
    language: 'Language of the contents',
    korean: 'Korean',
    english: 'English',
    koreanOnly: 'Available in Korean only',
    counts: '{p0} skills · {p1} workflows · {p2} prompts',
    allInstalled: 'All installed',
    someInstalled: '{p1} of {p0} files already exist',
    showSkills: 'Show the skills',
    location: 'Installed to: {p0}',
    install: 'Install selected sets',
    installing: 'Installing…',
    close: 'Close',
    done: 'Installed {p0} files. {p1} existing files were left as they were. They are available from the next conversation.',
    nothingNew:
      'Nothing new was installed. The selected sets are already there.',
    partly: 'Installed {p0} files; {p1} could not be installed: {p2}',
    failed: 'Could not install: {p0}',
    loading: 'Checking…',
    updateBanner:
      '{count} default Skills have a newer edition: {names}. These are unedited old default copies, so they can be replaced.',
    updateReplace: 'Replace',
    updateClose: 'Close',
    updateNote:
      'Replaces an unedited old default Skill copy with the edition bundled in the plugin.',
    updateDone:
      'Skill update: replaced {replaced}, rejected {rejected}, changed meanwhile {changed}, failed {failed}',
  },
  Compatibility: {
    pluginLine:
      'Update {name} to {required} or later (installed: {installed}): {change}',
    hostLine: 'Update Verbex to use the skills from {name}.',
    howTo: 'To update: Settings > Community plugins > Check for updates',
    badgeRequired: 'Update required',
    badgeRecommended: 'Update recommended',
    dismiss: 'Dismiss this notice',
    change: {
      hwpCollab: 'you get its HWP co-editing skill (Korean only).',
      webTable: 'you get its web table collection skill (Korean only).',
      presentation: 'you get its slide deck skill (Korean only).',
      hwpxExporter:
        'you get its HWPX writing and format reuse skills (Korean only).',
      dataChart:
        'you get the updated "Data insights and charts" skill, and charts can be checked against their data, redrawn and restyled.',
      dataviewSources:
        'it reports the correct source notes for grouped queries (AI-private notes stay protected) and adds a field lookup tool.',
    },
    bridgeConnector:
      "{name} is on. The API connector '{connector}' does the same job and can be removed in Verbex settings.",
    bridge: {
      dataview:
        'Install Verbex Dataview Bridge to use Dataview queries (Settings → Community plugins).',
      tasks:
        'Install Verbex Tasks Bridge to check off Tasks items (Settings → Community plugins).',
      templater:
        'Install Verbex Templater Bridge to get the Templater guide Skill (Settings → Community plugins).',
    },
    feature: {
      skills: 'its skills become available.',
      extract: 'its documents can be indexed.',
      ownership: 'documents in its companion editor can be saved safely.',
      privacy: 'the AI can read its documents.',
      bridge: 'the bridge works.',
    },
  },
}
