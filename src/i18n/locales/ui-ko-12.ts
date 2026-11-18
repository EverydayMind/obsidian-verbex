export const ui12 = {
  LexicalMenu: {
    typeaheadMenu: '자동 완성 메뉴',
  },
  ApplyTargetModal: {
    title: '노트에 초안 적용',
    mode: '적용 모드',
    existing: '변경 검토 후 기존 노트에 적용',
    newNote: '새 노트',
    how: '적용 방법',
    append: '끝에 초안 추가',
    replace: '노트 전체 교체',
    section: 'Markdown 섹션 하나 교체',
    heading: '섹션 제목',
    headingPlaceholder: '분석 결과',
    path: '대상 노트 경로',
    appendDesc:
      '이 노트 끝에 초안을 추가합니다. 변경 검토에는 추가되는 블록만 표시됩니다.',
    sectionDesc:
      '일치하는 Markdown 제목의 섹션만 교체하며 변경 검토에 표시됩니다.',
    replaceDesc:
      '노트 전체를 이 초안으로 교체합니다. 쓰기 전에 변경 검토에서 전체 파일의 교체 내용을 확인합니다.',
    chooseExisting: '계속하려면 기존 Markdown 노트를 선택하세요.',
    alreadyExists:
      '이미 존재하는 노트입니다. 기존 노트 모드로 전환하거나 새 경로를 선택하세요.',
    newDesc: '이 초안으로 새 Markdown 노트를 바로 만듭니다.',
  },
  AssistantMessageAnnotations: {
    sources: '출처 보기 ({p0})',
  },
  AssistantMessageReasoning: {
    reasoning: '추론',
  },
  AuditTracePanel: {
    contextAudit: '컨텍스트 감사 ({p0}턴)',
    turn: '턴 {p0}',
    events: '집계 이벤트 {p0}개',
  },
  ImageUploadButton: {
    image: '이미지',
  },
  MentionableBadge: {
    currentFile: ' (현재 파일)',
  },
  CreateTemplatePopoverPlugin: {
    createTemplate: '템플릿 만들기',
  },
  UserMessageActions: {
    copyMessage: '메시지 복사',
    queryInformation: '질의 정보',
    model: '모델:',
    attachedContext: '첨부 컨텍스트:',
    skills: 'Skill:',
    workflow: 'Workflow:',
    none: '없음',
    viewDetails: '상세 보기',
  },
  LLMResponseInfoPopover: {
    information: 'LLM 응답 정보',
    tokenCount: '토큰 수',
    input: '입력:',
    output: '출력:',
    total: '합계:',
    estimatedPrice: '예상 비용:',
    notAvailable: '정보 없음',
    noUsage: '이 모델의 사용량 통계는 제공되지 않습니다',
  },
  MarkdownCodeComponent: {
    expand: '내용 블록 펼치기',
    collapse: '내용 블록 접기',
    viewRaw: '원문 보기',
    viewFormatted: '서식 적용 보기',
    copied: '복사됨',
    copy: '복사',
    applying: '적용 중...',
  },
  SkillContextResults: {
    count: 'Skill ({p0}/{p1})',
    empty: '컨텍스트에 Skill 없음',
    resend: '선택한 컨텍스트로 다시 보내기',
  },
  WorkflowContextResults: {
    count: 'Workflow ({p0}/{p1})',
    empty: '컨텍스트에 Workflow 없음',
  },
  ChatListDropdown: {
    history: '채팅 기록',
    empty: '대화 없음',
  },
  VerbexDiffReview: {
    explicitApproval: '쓰기 전에 명시적 승인이 필요합니다.',
    diffRequired: '적용 전에 변경 검토가 필요합니다.',
    tidyApproval: '이 노트 정리 변경은 항상 명시적 승인이 필요합니다.',
    autoApproval: '자동 모드: 취소할 수 있는 카운트다운 후 적용합니다.',
    sessionTrust: '이 세션에서 신뢰하도록 설정되었습니다.',
    destructiveApproval:
      '이 쓰기는 기존 파일을 비우거나 크게 줄이므로(암묵적 삭제), 명시적 승인이 필요합니다.',
    create: '생성',
    body: '본문',
    frontmatter: '프런트매터',
    rename: '이름 변경',
    move: '이동',
    delete: '삭제',
    link: '링크',
    highRisk: '위험도가 높은 작업으로, 명시적 승인이 필요합니다',
    countdown: '자동 모드: {p0}초 후 적용',
    reviewManually: '직접 검토',
    wholeChange: '전체 변경',
    preview: '적용 결과 미리 보기',
    applySelected: '선택 항목 적용',
  },
  VerbexBatchDiffReview: {
    selected: '변경 {p1}개 중 {p0}개 선택됨',
    rejectAll: '모두 거절',
    highRisk: '높은 위험도',
    exclude: '이 파일 제외',
  },
  VerbexDiffModal: {
    title: 'Verbex 변경 검토: {p0}',
  },
  VerbexBatchDiffModal: {
    title: 'Verbex 변경 검토 ({p0})',
  },
  ApplyViewRoot: {
    fileChanged:
      '변경 검토 중 파일이 바뀌었습니다. 변경 사항을 적용하지 않았습니다.',
    failed: '적용 실패: {p0}',
    applying: '적용 중: {p0}',
    previousDiff: '이전 변경',
    nextDiff: '다음 변경',
    position: '{p1}개 중 {p0}',
    acceptChanges: '변경 사항 수용',
    accept: '수용',
    cancelApply: '적용 취소',
    acceptIncoming: '새 내용 수용',
    acceptCurrent: '기존 내용 유지',
    acceptBoth: '둘 다 수용',
  },
  ErrorModal: {
    openSettings: '설정 열기',
  },
  InstallerUpdateRequiredModal: {
    title: 'Verbex를 사용하려면 Obsidian 업데이트가 필요합니다',
    description:
      'Verbex를 사용하려면 더 최신 버전의 Obsidian 설치 프로그램이 필요합니다. 앱 내부 업데이트와는 다릅니다. Verbex를 계속 사용하려면 최신 버전의 Obsidian을 직접 다운로드하여 설치하세요.',
    openDownload: '다운로드 페이지 열기',
  },
  DotLoader: {
    loading: '불러오는 중',
  },
  SplitButton: {
    showMore: '추가 옵션 표시',
  },
  StatusViewRoot: {
    pluginToolStates:
      '플러그인 도구: 사용 중 {active} · 승인 대기 {pending} · 재승인 필요 {reapproval} · 꺼짐 {disabled}',
    approvalBanner: '플러그인 {count}개가 도구 승인을 기다립니다',
    approvalBreakdown: ' (승인 대기 {pending}, 재승인 {reapproval})',
    approvalReview: '검토',
    approvalDismiss: '닫기',
    bm25Only: '검색 방식이 BM25 전용입니다',
    notUsed: '사용 안 함',
    contentBytes: '본문 {p0}',
    vectorBytes: '벡터 {p0}',
    metadataBytes: '메타데이터 {p0}',
    tableBytes: '테이블 {p0}',
    indexBytes: '색인 {p0}',
    excluded: ' (제외됨)',
    adHoc: '임시 작업',
    noWorkflow: 'Workflow 없음',
    documents: '문서 {p0}개',
    notBuilt: '아직 구축되지 않음',
    chunks: '청크 {p0}개',
    contextBudget: '자동 컨텍스트 예산의 {p0}% · 대화 내용과 도구 스키마 제외',
  },
  ChatUserInput: {
    contextAuto: '컨텍스트: 자동',
    contextFull: '컨텍스트: 전체',
    contextCatalog: '컨텍스트: 카탈로그',
    contextOff: '컨텍스트: 끔',
  },
  TemplateFormModal: {
    addTitle: '템플릿 추가',
    editTitle: '템플릿 편집',
    enterContent: '템플릿 내용을 입력하세요',
    enterName: '템플릿 이름을 입력하세요',
    created: '템플릿 생성됨: {p0}',
    updated: '템플릿 수정됨: {p0}',
    duplicate: '같은 이름의 템플릿이 이미 있습니다',
    createFailed: '템플릿을 만들지 못했습니다',
    loadFailed: '템플릿을 불러오지 못했습니다. 다시 시도하세요.',
    name: '이름',
    nameDesc: '템플릿 이름',
    content: '템플릿 내용',
    contentDesc: '템플릿의 내용',
  },
  VerbexRuntimeSections: {
    auto: '자동 (플래너가 결정)',
    full: '전체 컨텍스트 본문',
    catalog: '카탈로그 참조만',
    off: '끄기 (도구만)',
    firstTurnMode: '첫 번째 턴 컨텍스트 모드',
    firstTurnModeDesc:
      '첫 번째 턴의 자동 검색 방식을 선택합니다. 자동에서는 플래너가 전체, 카탈로그 또는 끄기를 선택하며, 명시적 첨부와 요약 및 Workflow 근거는 보호됩니다.',
    catalogTokenBudget: '카탈로그 토큰 예산',
    catalogTokenBudgetDesc:
      '카탈로그 모드에서 본문 없는 검색 후보에 사용할 최대 추정 토큰 수입니다.',
    catalogCandidateLimit: '카탈로그 후보 수 제한',
    catalogCandidateLimitDesc:
      '카탈로그 모드에서 표시할 본문 없는 후보 참조의 최대 개수입니다.',
  },
  PlanTracker: {
    understand: '요청 파악',
    respond: '응답 작성',
  },
  agentCompletion: {
    validationFailureAcceptedAsIsByThe: '검증 실패를 사용자가 그대로 수용함',
    agentRunComplete: '에이전트 실행 완료: {p0}',
    attempts: '{p0}회 시도',
    '1Attempt': '1회 시도',
  },
  AgentRunExecution: {
    agentExecutionPlanPreparedCoverage:
      '에이전트 실행 계획 수립: {p0} ({p1} coverage)',
    toolWasNotIncludedInThisRequest:
      '도구 {p0}이(가) 이번 요청에 포함되지 않아 실행하지 못했습니다. 채팅의 도구 선택에서 고정하면 다음 요청부터 포함됩니다.',
    removedFilesConsideredUnrelatedToTheCurrent:
      '현재 작업과 무관하다고 판단된 파일 {p0}개를 컨텍스트에서 제거했습니다.',
    compactedContextBySummarizingEarlierMessages:
      '이전 대화 {p0}개를 요약해 컨텍스트를 압축했습니다.',
  },
  modelReadiness: {
    noChatModelsAreRegisteredAddA:
      '등록된 채팅 모델이 없습니다. 설정에서 모델을 추가하세요.',
    theSelectedChatModelCouldNotBe:
      '선택된 채팅 모델을 찾을 수 없습니다(삭제되었을 수 있음). 설정에서 다른 모델을 선택하세요.',
    theSelectedChatModelIsDisabledEnable:
      '선택된 채팅 모델 "{p0}"이(가) 비활성화되어 있습니다. 설정에서 다시 활성화하거나 다른 모델을 선택하세요.',
    theProviderForTheSelectedChatModel:
      '선택된 채팅 모델 "{p0}"의 프로바이더를 찾을 수 없습니다(삭제되었을 수 있음). 설정에서 프로바이더를 다시 추가하거나 다른 모델을 선택하세요.',
    providerHasNoAPIKeyEnterAn:
      '프로바이더 "{p0}"에 API 키가 설정되지 않았습니다. 설정에서 API 키를 입력하세요.',
    keychainMissing:
      '키체인에 이 공급자의 API 키가 없습니다. 설정 → Verbex에서 공급자를 열어 키를 다시 넣으세요.',
    providerHasNoBaseURLEnterA:
      '프로바이더 "{p0}"에 Base URL이 설정되지 않았습니다. 설정에서 Base URL을 입력하세요.',
    theSelectedChatModelDoesNotSupport:
      '선택된 채팅 모델 "{p0}"은(는) 도구 호출을 지원하지 않습니다. 도구 호출을 끄거나 지원 모델을 선택하세요.',
  },
  browserStatusText: {
    running: '진행 중',
    executionRecordFound: '실행 기록 있음',
    noRecordInCurrentProviderNotProof:
      '현재 provider에 기록 없음 · 미실행 증거가 아님',
    inputNotSent: '입력이 전송되지 않음',
    inputSent: '입력 전송됨',
    inputPartiallySent: '입력 일부만 전송됨',
    inputTransmissionUnknown: '입력 전송 여부 불명',
    inputAppliedExternalOperationSuccessUnverified:
      '입력 적용됨 · 외부 업무 성공은 미확인',
    inputNotApplied: '입력 적용되지 않음',
    inputApplicationUnknown: '입력 적용 여부 불명',
    actions: ' {p0}{p1}/{p2}건',
    recordedSteps: '기록된 단계 ',
    recordCode: ' · 기록 코드 {p0}',
    theProviderRecordedARejectionBeforeExecution:
      ' Provider 기록상 실행 전에 거부되어 입력을 보내지 않았습니다. 사이트 상태가 그대로인지 확인한 뒤 해제하세요.',
    checkingStatusDoesNotUnblockTheAction:
      '{p0}{p1} 조회로 차단을 해제하지 않습니다. 사이트에서 직접 확인하세요.',
  },
  browserStatus: {
    noUnresolvedActionsFoundForThisConversation:
      '이 대화의 미확정 작업을 찾을 수 없습니다.',
    providerUnavailableOrAPreviousCallIs:
      'Provider가 없거나 이전 호출이 진행 중입니다. 나중에 확인하세요.',
  },
  descriptorDiff: {
    none: '(없음)',
  },
  revealSavedAnchorCandidate: {
    invalidParagraphLocation: '문단 위치가 올바르지 않습니다.',
    noCurrentParagraphCandidates: '현재 문단 후보가 없습니다.',
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    invalidDocumentPath: '문서 경로가 올바르지 않습니다.',
    approvedHWPHandsIsUnavailable: '승인된 HWP Hands를 사용할 수 없습니다.',
    hWPHandsLocationNavigationIsUnavailable:
      'HWP Hands 위치 보기를 사용할 수 없습니다.',
    locationNavigationCancelledOrThePluginIs:
      '위치 보기가 취소됐거나 플러그인이 사용 중입니다.',
    stateChangedBeforeLocationNavigation: '위치 보기 전 상태가 변경됐습니다.',
    stateChangedDuringLocationNavigationCheckThe:
      '위치 보기 중 상태가 변경됐습니다. 문서 화면을 확인하세요.',
  },
  resolveSavedAnchorRefs: {
    invalidParagraphLocationRange: '문단 위치 범위가 올바르지 않습니다.',
  },
  resolveSavedAnchorCandidates: {
    invalidParagraphLocationRange: '문단 위치 범위가 올바르지 않습니다.',
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    noParagraphLocationsToCheck: '확인할 문단 위치가 없습니다.',
    approvedHWPHandsIsUnavailable: '승인된 HWP Hands를 사용할 수 없습니다.',
    hWPHandsOpenDocumentInspectionIsUnavailable:
      'HWP Hands의 열린 문서 확인 기능을 사용할 수 없습니다.',
    hWPHandsQueryCancelledOrBusy: 'HWP Hands 조회가 취소됐거나 사용 중입니다.',
    hWPHandsChanged: 'HWP Hands가 변경됐습니다.',
    vaultChangesWereObservedDuringTheQuery:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    vaultChangesWereObservedDuringTheQuery2:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    hWPHandsStateChangedDuringTheQuery:
      '조회 중 HWP Hands 상태가 바뀌었습니다.',
    paragraphCandidatesDoNotMatchTheSave:
      '문단 후보가 저장 기록 또는 열린 문서와 일치하지 않습니다.',
  },
  resolveAnchorBatch: {
    paragraphLocationRecordsExpired: '문단 위치 기록이 만료됐습니다.',
    noParagraphLocationsToCheck: '확인할 문단 위치가 없습니다.',
    approvedKORDOCIsUnavailable: '승인된 KORDOC을 사용할 수 없습니다.',
    kORDOCParagraphReferenceVerificationIsUnavailable:
      'KORDOC 문단 참조 확인을 사용할 수 없습니다.',
    kORDOCQueryCancelledOrBusy: 'KORDOC 조회가 취소됐거나 사용 중입니다.',
    kORDOCChanged: 'KORDOC이 변경됐습니다.',
    vaultChangesWereObservedDuringTheQuery:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    vaultChangesWereObservedDuringTheQuery2:
      '조회 중 Vault 변경이 관측됐습니다. 변경 원인은 확인되지 않았습니다.',
    kORDOCStateChangedDuringTheQuery: '조회 중 KORDOC 상태가 바뀌었습니다.',
    paragraphReferencesDoNotMatchTheSave:
      '문단 참조 결과가 저장 기록과 일치하지 않습니다.',
  },
  editorReveal: {
    thisPluginDoesNotSupportLocationNavigation:
      '이 플러그인은 위치 보기를 지원하지 않습니다.',
    thePluginChangedOrAPreviousCall:
      '플러그인이 바뀌었거나 이전 호출이 진행 중입니다. 잠시 뒤 다시 누르세요.',
    thePluginChangedWhileOpeningTheLocation:
      '위치를 여는 동안 플러그인이 변경됐습니다. 문서에서 확인하세요.',
  },
  documentJobNotice: {
    hWPXFormatJobBlocked: 'HWPX 서식 작업이 차단되었습니다 ({p0}). {p1}',
  },
}
