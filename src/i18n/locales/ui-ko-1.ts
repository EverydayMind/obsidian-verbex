export const ui1 = {
  McpApprovalModal: {
    approveMCPCall: '외부 도구 호출을 하게 할까요?',
    confirmAutomaticMCPApproval: '이 외부 도구를 항상 허용할까요?',
    thisToolSendsArgumentsToAnExternal:
      '이 도구는 아래 내용을 외부 서버나 이 컴퓨터의 프로그램에 보내며, 그쪽의 서비스·파일을 바꿀 수 있습니다. 외부 도구가 볼트 밖에서 바꾼 것은 Verbex가 되돌릴 수 없습니다. 결과는 이후 설정한 AI 모델 서비스로 전송될 수 있습니다.',
    argumentsToSend: '보낼 내용',
    reviewToolDefinition: '자세히',
    automaticApprovalAppliesToAllFutureArguments:
      '자동 허용은 앞으로 이 도구가 보내는 모든 내용에 적용됩니다. 서버 설정이나 도구 설명이 바뀌면 다시 묻습니다.',
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
      '{p0}의 AI 변경 사항을 편집 중인 사본에서 버리시겠습니까? 원본 파일은 바뀌지 않습니다.',
    cancel: '취소',
    discard: '버리기',
  },
  CommitApprovalModal: {
    approveDocumentSave: '이 문서를 저장하게 할까요?',
    approveSaveAs: '새 파일로 저장하게 할까요?',
    approveNewDocument: '이 문서를 만들게 할까요?',
    saveTheWorkingCopyOfToIts: '{p0}의 편집 중인 사본을 그 파일에 저장합니다.',
    saveTheWorkingCopyOfToA:
      '편집 중인 사본을 새 파일로 저장합니다: {p0} (원본: {p1}). 원래 문서의 저장 안 한 변경은 그대로 남습니다.',
    createANewDocument: '새 문서를 만듭니다: {p0}{p1}',
    itWillBeACopyOfTemplate:
      '\n사용하는 템플릿: {p0}. 템플릿은 바뀌지 않습니다.',
    requestedToolV: '요청한 도구: {p0} · {p1} v{p2}',
    filesAndFoldersToChangeOrCreate: '바뀌거나 새로 생기는 파일·폴더',
    newFolder: '새 폴더',
    newFile: '새 파일',
    overwrite: '덮어쓰기',
    pluginNotes: '플러그인이 알린 내용',
    temporaryWorkingFiles: '임시 파일 ({count}개), 끝나면 지워짐',
    beforeWritingTheCurrentContentsOfThese:
      '바뀌는 파일은 저장 전에 되돌리기 지점을 만듭니다. 저장을 되돌리려면 명령 팔레트에서 "{command}" 명령을 실행하세요. 이 허용은 이번 저장 한 번에만 쓰이고, 이 창이 떠 있는 동안 파일이 바뀌면 저장하지 않습니다.',
    newFilesOnly:
      '새로 만드는 파일이라 덮어쓰는 내용은 없습니다. 만든 파일을 없애려면 명령 팔레트에서 "{command}" 명령을 실행하세요(만든 뒤 바뀐 파일은 그대로 둡니다). 이 허용은 이번 만들기 한 번에만 쓰이고, 이 창이 떠 있는 동안 같은 경로에 파일이 생기면 만들지 않습니다.',
    allowThisSave: '이번 저장 허용',
    allowCreating: '만들기 허용',
    deny: '거절',
  },
  BrowserApprovalModal: {
    approveOneBrowserAction: '이 브라우저 동작을 하게 할까요?',
    checkTheSiteAndOutgoingContentThis:
      '사이트와 보내는 내용을 확인하세요. 이번 동작 한 번만 허용합니다. 페이지가 무엇을 주고받을지 미리 다 알 수는 없으며, 사이트에서 바뀐 것은 Vault 실행 취소로 되돌릴 수 없습니다.',
    actualTargetAndSite: '실제 대상과 사이트',
    exactActionAndOutgoingContent: '정확한 동작과 전송 내용',
    expectedEffectsPluginDescription: '예상 영향 · 플러그인 제공 설명',
    allowThisActionOnly: '이번 동작만 허용',
    deny: '거절',
    site: '사이트: {site}',
    action: '동작: {action}',
    contentBeingSent: '보내는 내용: {content}',
    details: '자세히',
    approvalExpiresInSeconds: '허용할 수 있는 시간: {p0}초 남음',
    browserActionApprovalExpiredTheActionWas:
      '브라우저 동작을 허용할 시간이 만료되어 실행되지 않았습니다. 다시 요청하세요.',
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
      '"{p0}"의 {p1}: 진행하면 약 {p2}개 구간을 ',
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
