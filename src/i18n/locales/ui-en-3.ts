export const ui3 = {
  OutputAnchorCard: {
    noParagraphLocationRecordsAreAvailableFor:
      'No paragraph location records are available for this save.',
    couldNotCheckParagraphLocationRecords:
      'Could not check paragraph location records.',
    checkingLocations: 'Checking locations…',
    viewParagraphLocationsAtSaveTime: 'View paragraph locations at save time',
    partialObservationsAtSaveTimeTheFile:
      'Partial observations at save time. The file may have changed since. These do not grant editing permission. Numbering starts at 0.',
    couldNotVerifyKORDOCReferencesCheckFile:
      'Could not verify KORDOC references. Check file changes and plugin status.',
    checkingKORDOC: 'Checking KORDOC…',
    verifyKORDOCReferencesForThisLocation:
      'Verify KORDOC references for this location',
    referencesReflectTheTimeOfTheKORDOC:
      'References reflect the time of the KORDOC check and do not grant editing permission.',
    couldNotCheckParagraphCandidatesInThe:
      'Could not check paragraph candidates in the open HWP Hands document. Check document status and plugin version.',
    checkingDocument: 'Checking document…',
    checkParagraphCandidatesInOpenHWPHands:
      'Check paragraph candidates in open HWP Hands',
    candidatesReflectTheOpenDocumentAtCheck:
      'Candidates reflect the open document at check time and do not grant editing permission.',
    locationS: ' location(s)',
    partiallyCollected: ' (partially collected)',
    conversionBlock: 'Conversion block ',
    bodyParagraph: ' → body paragraph ',
    requestedVariant: ' · requested variant {p0}{p1}',
    noRule: ' (no rule)',
    noKORDOCReference: ' → no KORDOC reference',
    hWPHandsCandidateRevision: ' → HWP Hands candidate (revision {p0})',
    noHWPHandsCandidate: ' → no HWP Hands candidate',
    viewLocationOfConversionBlock: 'View location of conversion block {p0}',
    checkTheLocationInTheHWPHands:
      'Check the location in the HWP Hands editor.',
    couldNotConfirmNavigationCheckTheDocument:
      'Could not confirm navigation. Check the document view and changes.',
    viewLocation: 'View location',
    previousLocations: 'Previous locations',
    nextLocations: 'Next locations',
  },
  OffscreenUnsavedCard: {
    couldNotOpenTheDocument: 'Could not open the document.',
    discardedAIChangesTo: 'Discarded AI changes to {p0}.',
    couldNotDiscardChanges: 'Could not discard changes.',
    offscreenUnsavedDocuments: 'Offscreen unsaved documents (',
    theWorkingCopiesEditedByAIIn:
      'The working copies edited by AI in this conversation have not yet been saved to disk.',
    processing: 'Processing…',
    open: 'Open',
    requestSave: 'Request save',
    discard: 'Discard',
  },
  LargeFileStatusCard: {
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    inProgress: 'In progress',
  },
  CommitCard: {
    saveResultNeedsVerification: 'Save result needs verification',
    saved: 'Saved',
    notSaved: 'Not saved',
    partiallySaved: 'Partially saved',
    unexpectedContents: 'Unexpected contents',
    noChanges: 'No changes',
    documentSaveResult: 'Document save result',
    checkingSaveStatus: 'Checking save status',
    checkTheFileStatusSavingWillNot:
      'Check the file status. Saving will not be retried automatically.',
    couldNotVerifySaveStatus: 'Could not verify save status.',
    checking: 'Checking…',
    checkResult: 'Check result',
  },
  ChatContextSelector: {
    pinned: 'Pinned',
    autoSuggestion: 'Auto suggestion',
    switchToAutoSuggestions: 'Switch to auto suggestions',
    switchToAutoSuggestions2: 'Switch to auto suggestions',
    auto: 'Auto',
    changeSkillWorkflow: 'Change Skill/workflow',
    change: 'Change',
  },
  ChatCallUsage: {
    calls: 'Calls ',
    about: 'about ',
    tokensRecordedSessionTotal: ' tokens · recorded session total',
    about2: 'about ',
    tokens: ' tokens',
  },
  Chat: {
    currentConversation: 'Current conversation',
    verbexInitializationFailed: 'Verbex initialization failed: ',
    reloadObsidianAndTryAgain: '. Reload Obsidian and try again.',
    unreadableConversationRecords: 'Unreadable conversation records: ',
    excludedFromTheListFilesWereNot:
      ' excluded from the list. Files were not deleted. Check the developer console for details.',
    continueToNext: 'Continue to next',
  },
  AssistantMessageContent: {
    unexecutedProposal: 'Unexecuted proposal',
    run: 'Run',
  },
  DocumentOcrControls: {
    allowManualPDFOCR: 'Allow manual PDF OCR',
    automaticIndexingDoesNotRunOCROnly:
      'Automatic indexing does not run OCR. Only the selected PDF is processed with a local model. Large documents may take a long time.',
    oCRThisPDF: 'OCR this PDF',
    specifyAPDFPathWithinTheIndexing:
      'Specify a PDF path within the indexing scope.',
    attachmentsScanPdf: 'attachments/scan.pdf',
    runningOCR: 'Running OCR…',
    oCRThisDocument: 'OCR this document',
    enterAPDFPathWithinTheIndexing:
      'Enter a PDF path within the indexing scope.',
    noExtractedContent: 'No extracted content',
    oCRApplied: 'OCR applied',
    oCRNotApplied: 'OCR not applied',
    oCRFailed: 'OCR failed',
  },
}
