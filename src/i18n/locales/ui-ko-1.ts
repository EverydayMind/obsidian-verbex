export const ui1 = {
  McpApprovalModal: {
    approveMCPCall: 'MCP 호출 승인',
    confirmAutomaticMCPApproval: 'MCP 자동 허용 확인',
    thisToolSendsArgumentsToAnExternal:
      '이 도구는 인자를 외부 서버 또는 로컬 프로그램에 전달하며 서비스·파일을 변경할 수 있습니다. Vault 체크포인트로 외부 변경을 복구할 수 없습니다. 결과는 이후 LLM 제공자에 전달될 수 있습니다.',
    argumentsToSend: '전달할 인자',
    reviewToolDefinition: '도구 정의 확인',
    automaticApprovalAppliesToAllFutureArguments:
      '자동 허용은 앞으로 이 도구의 모든 인자에 적용됩니다. 서버 설정 또는 도구 정의가 바뀌면 다시 승인을 요청합니다.',
    allowThisCall: '이번 호출 허용',
    automaticallyAllowThisTool: '이 도구 자동 허용',
    deny: '거절',
  },
  InlinePromptModal: {
    run: '실행',
    cancel: '취소',
  },
  IndexTargetModal: {
    confirmWorkingFolder: '작업 폴더 확인',
    enterAFolderPathToWorkIn:
      '작업을 진행하거나 재사용할 폴더 경로를 입력하세요.',
    thisFolderHasAnExistingIndexWiki:
      '이 폴더에 기존 인덱스/wiki가 있습니다 (노트 {p0}개). 재사용하거나 새로 빌드할 수 있습니다. 새로 빌드하면 진행 상태(_checklist.md)가 초기화됩니다 (findings는 보존).',
    thisFolderHasNotesButNoChecklist:
      '이 폴더에 노트 {p0}개가 있지만 체크리스트가 없습니다. 새로 빌드하면 이 폴더 안에 파일들이 생성됩니다.',
    thisFolderIsEmptyOrNewA: '빈 폴더(또는 새 폴더)입니다. 새로 빌드합니다.',
    whereShouldTheReviewFolderForGo: '"{p0}"의 검토용 폴더를 어디에 둘까요?',
    exampleIndexWorkingFolder: '예: Index/작업_폴더',
    reuseExistingIndex: '기존 인덱스 재사용',
    rebuildRegenerate: '새로 빌드 (다시 생성)',
    buildNewIndex: '새로 빌드',
    cancel: '취소',
  },
  DocumentJobBodyChoiceModal: {
    paragraphs: '{p0} · 문단 {p1}개 · {p2}{p3}',
    noSymbol: '(기호 없음)',
    chooseBodyFormatting: '본문 서식 선택',
    chooseAParagraphFormatFromTheSample:
      '샘플 문서에서 본문으로 쓸 문단 서식을 고르세요. 새 문서의 본문 문단이 이 서식을 따릅니다.',
    skip: '건너뛰기',
  },
  DocumentIndexScopeModal: {
    chooseFoldersForDocumentSearch: '문서 검색을 켤 폴더 지정',
    extractHWPHWPXAndPDFLocallyEnter:
      'HWP·HWPX·PDF를 로컬에서 추출합니다. 줄마다 폴더 경로나 패턴을 지정하세요. Vault 전체를 원하면 **/*를 명시하세요.',
    includePaths: '포함 경로',
    enableForSelectedScope: '선택 범위에서 켜기',
    cancel: '취소',
  },
  DiscardAgentChangesModal: {
    discardAIChanges: 'AI 변경 사항 버리기',
    discardTheAIChangesToFromThe:
      '{p0}의 AI 변경 사항을 작업본에서 버리시겠습니까? 원본 파일은 바뀌지 않습니다.',
    cancel: '취소',
    discard: '버리기',
  },
  CommitApprovalModal: {
    approveDocumentSave: '문서 저장 승인',
    approveSaveAs: '다른 이름으로 저장 승인',
    approveNewDocument: '새 문서 만들기 승인',
    saveTheWorkingCopyOfToIts: '{p0} 작업본을 그 파일에 저장할까요?',
    saveTheWorkingCopyOfToA:
      '{p0} 작업본을 새 파일 {p1}(으)로 저장할까요? 원래 문서의 저장 안 한 변경은 그대로 남습니다.',
    createANewDocument: '새 문서 {p0}을(를) 만들까요?{p1}',
    itWillBeACopyOfTemplate:
      ' 템플릿 {p0}의 사본으로 만들며 템플릿은 바뀌지 않습니다.',
    requestedToolV: '요청한 도구: {p0} · {p1} v{p2}',
    filesAndFoldersToChangeOrCreate: '바뀌거나 새로 생기는 파일·폴더',
    newFolder: '새 폴더',
    newFile: '새 파일',
    overwrite: '덮어쓰기',
    pluginNotes: '플러그인이 알린 내용',
    beforeWritingTheCurrentContentsOfThese:
      '허용하면 쓰기 전에 위 파일의 지금 내용을 체크포인트로 남기고, 쓴 뒤 파일을 다시 읽어 확인합니다. Verbex 롤백 명령으로 되돌릴 수 있습니다. 이 승인은 이번 저장 한 번에만 쓰이며, 승인하는 동안 문서나 파일이 바뀌면 저장하지 않습니다.',
    allowThisSave: '이번 저장 허용',
    deny: '거절',
  },
  BrowserApprovalModal: {
    approveOneBrowserAction: '브라우저 동작 1회 승인',
    checkTheSiteAndOutgoingContentThis:
      '사이트와 전송 내용을 확인하세요. 이번 동작에만 적용됩니다. 페이지가 유발하는 모든 통신을 미리 확정할 수 없으며 사이트의 변경은 Vault 실행 취소로 되돌릴 수 없습니다.',
    actualTargetAndSite: '실제 대상과 사이트',
    exactActionAndOutgoingContent: '정확한 동작과 전송 내용',
    expectedEffectsPluginDescription: '예상 영향 · 플러그인 제공 설명',
    allowThisActionOnly: '이번 동작만 허용',
    deny: '거절',
    approvalExpiresInSeconds: '승인 유효 시간: {p0}초 남음',
    browserActionApprovalExpiredTheActionWas:
      '브라우저 동작 승인 시간이 만료되어 실행되지 않았습니다. 다시 요청하세요.',
  },
  ToolCatalogControls: {
    groupBy: '모아보기 기준',
    groupByPlugin: '플러그인별 모아보기',
    groupByApprovalStatus: '승인 상태별 모아보기',
    approvalStatus: '승인 상태',
    allApprovalStatuses: '전체 승인 상태',
  },
  useChatStreamManager: {
    wholeDocumentConversion: '전체 문서 변환',
    wholeDocumentAnalysis: '전체 문서 분석',
    confirmLargeDocumentOperation: '대용량 작업 확인',
    processingForWillHandleAboutSections:
      '"{p0}"의 {p1}을(를) 진행하면 약 {p2}개 구간을 ',
    sequentiallyRequiringLLMCallsTimeAndCost:
      '순차 처리하며, 그만큼 LLM 호출과 시간·비용이 듭니다.\n\n계속할까요?',
    continue: '계속',
    applyTheItemsThatFailedValidationAs: '검증 실패 항목을 그대로 반영할까요?',
    automaticValidationRepeatedlyFailedNNN:
      '자동 검증이 반복 실패했습니다:\n\n{p0}\n\n',
    acceptTheCurrentResultWithoutFurtherAttempts:
      '수정을 더 시도하지 않고 현재 결과를 그대로 채택하시겠습니까?',
    applyAsIsY: '그대로 반영(Y)',
    evidenceLedgerSearchCandidatesSourceDocumentsReturned:
      '근거 ledger: 검색 후보 {p0}개, 읽기 결과를 받은 원문 {p1}개 (전체 검토 여부는 범위 기록 참조)',
    theModelRepeatedlyReturnedPlainTextInstead:
      '모델이 실제 tool_call 대신 일반 텍스트를 반복했습니다. ',
    theLastToolResultMayNotHave:
      '마지막 도구 결과가 모델에 전달되지 않았을 수 있습니다. ',
    theAutomaticIterationLimitWasReachedBefore:
      '자동 반복 한도({p0}회)에 도달해 응답을 마치지 못했습니다. ',
    toolWasCalledTimesWithTheSame:
      '{p0} 도구를 같은 인자로 {p1}회 호출했습니다. {p2} 요청을 나누거나 필요한 값·범위를 직접 알려 주세요.',
    increaseMaxAutoToolRequestsInSettings:
      '설정의 "Max auto tool requests" 값을 올리거나 대화를 이어서 진행하세요.',
    appliedAsIsAfterTheUserAccepted:
      '⚠️ 검증 실패를 사용자가 수용해 그대로 반영됨',
  },
}
