export const ui2 = {
  useBrowserContext: {
    selectATargetWebTab: '대상 웹 탭을 선택하세요',
    noOpenWebTabs: '열린 웹 탭 없음',
    webHandsReadingIsOff: 'Web Hands 읽기 꺼짐',
    webTabUnavailable: '웹 탭을 사용할 수 없음',
    noOpenWebTabs2: '열린 웹 탭 없음',
    webTabIsHidden: '웹 탭이 숨겨져 있음',
    webTabHasNotLoaded: '웹 탭이 아직 로드되지 않음',
    webTabContextCleared: '웹 탭 문맥 해제됨',
    checkWebToolApprovalAndReadingSettings:
      '웹 도구 승인·읽기 설정을 확인하세요',
    webTab: '웹 탭',
    webTabTarget: '웹 탭 대상',
    autoMostRecentlyUsedTab: '자동 — 최근 사용 탭',
    off: '해제',
    selectedTabUnavailable: '선택한 탭을 사용할 수 없음',
    hidden: ' (숨김)',
    refreshWebTabs: '웹 탭 새로 고침',
  },
  ToolMessage: {
    apply: '적용',
    reject: '거절',
    allow: '허용',
    abort: '중단',
    parameters: '매개변수:',
    result: '결과:',
    error: '오류:',
    noParameters: '매개변수 없음',
    compactView: '간략히 보기',
    advancedViewRawData: '고급 보기 (원본 확인)',
    proposalBeforeSaving: '저장 전 제안',
    saveDenied: '저장 거절',
    fileSaveVerified: '파일 저장 확인',
    saveFailed: '저장 실패',
    saveStatusUnknownDoNotRetryAutomatically:
      '저장 여부 불명 — 자동 재실행 금지',
    checkpoint: '체크포인트: ',
    furtherExecutionStoppedCheckTheSaveAnd:
      '후속 실행을 중단했습니다. 저장·기록 상태를 확인하세요.',
  },
  SkillAvailability: {
    requiredPluginsAreDisabled: '필요한 플러그인이 꺼져 있습니다: {p0}',
  },
  SessionGrants: {
    turnOffSavedParagraphLocationCollection: '저장 문단 위치 수집 끄기',
    turnOnSavedParagraphLocationCollection: '저장 문단 위치 수집 켜기',
    appliesToSubsequentHWPXSavesInThis:
      '이 대화의 이후 HWPX 저장에 적용됩니다. 종료 시 기록이 지워집니다.',
    documentEditingApprovalForThisConversation: '이 대화의 문서 편집 승인',
    documentEditingApprovalForThisConversation2: '이 대화의 문서 편집 승인',
    editingApprovalRevokedAppliedChangesRemainIn:
      '편집 승인을 철회했습니다. 이미 적용된 변경은 작업본에 남아 있습니다.',
    editingApprovalRevokedDocumentDisconnectionCouldNot:
      '편집 승인을 철회했습니다. 문서 연결 해제는 확인하지 못했습니다.',
    revokeEditingApproval: '편집 승인 철회',
  },
  SessionExportButton: {
    exportCurrentSessionChatAndLogs: '현재 세션 대화·로그 반출',
    savesChatToolResultsRunRecordsAnd:
      '대화·도구 결과·Run 기록과 공용 진단을 저장합니다. 문서 내용과 경로가 포함될 수 있으므로 공유 전 확인하세요. 설정과 원본 첨부파일은 수집하지 않습니다.',
    thisConversationIsRunningChatUpTo:
      '실행 중인 대화입니다. 버튼을 누른 시점까지의 대화와 수집 시점의 로그가 저장됩니다.',
    destinationFolder: '저장할 폴더',
    enterTheAbsolutePathOfAnExisting:
      '기존 폴더의 절대 경로를 입력하세요. 그 아래에 새 반출 폴더를 만듭니다.',
    export: '반출',
    enableSettingsAdvancedDebugModeToExport:
      '설정 → 고급 → 디버그 모드를 켜면 반출할 수 있습니다',
    exportComplete: '반출 완료: {p0}',
    exportedFolder: '반출된 폴더',
    exportedFolderPath: '반출된 폴더 경로',
    copyPath: '경로 복사',
    exportedFolderPathCopied: '반출된 폴더 경로를 복사했습니다.',
    couldNotCopyThePathClickThe:
      '경로를 복사하지 못했습니다. 반출된 폴더 경로 입력란을 클릭한 뒤 직접 복사하세요.',
    sessionExported: '세션 반출 완료: {p0}',
    exportComplete2: '반출 완료',
    exportCompletedButTheSuggestedFolderCould:
      '반출은 완료했지만 다음에 제안할 폴더를 저장하지 못했습니다.',
    exportFailedCheckTheFolderPathAnd:
      '반출하지 못했습니다. 폴더 경로와 쓰기 권한을 확인한 뒤 다시 시도하세요. 저장 도중 실패했다면 manifest.json이 없는 미완료 폴더가 남을 수 있습니다.',
    close: '닫기',
    exportCurrentSessionChatAndLogs2: '현재 세션 대화·로그 반출',
    exportCurrentSessionChatAndLogs3: '현재 세션 대화·로그 반출',
    enableSettingsAdvancedDebugModeToExport2:
      '설정 → 고급 → 디버그 모드를 켜면 반출할 수 있습니다',
  },
  sessionEditCardModel: {
    manualEditingNeeded: '직접 편집 필요 · {p0}',
    protectedObjectsPreventedEditingOpenTheLocation:
      '보호된 개체가 있어 편집하지 않았습니다. 위치를 열어 직접 확인하세요.',
    thisEditWasAppliedToTheWorking:
      '이 편집은 작업본에 적용됐습니다. 현재 저장 상태는 문서에서 확인하세요.',
    thisDocumentWasOffScreenWhenEdited:
      '편집 당시 화면에 없던 문서입니다. 위치 보기로 현재 상태를 확인하세요.',
    redrawnFromPage: '{p0}쪽부터 다시 그렸습니다.',
    workingCopyEdit: '작업본 편집 · {p0}',
  },
  SessionEditCard: {
    openedTheLocationThatCouldNotBe: '편집하지 못한 위치를 열었습니다.',
    openedTheEditedLocation: '수정 위치를 열었습니다.',
    documentOpenedCheckTheCurrentDocumentFor:
      '문서를 열었습니다. 이전 수정 위치는 현재 문서에서 확인해 주세요.',
    couldNotOpenTheDocument: '문서를 열지 못했습니다.',
    lastEditUndone: '마지막 편집을 되돌렸습니다.',
    couldNotUndo: '되돌리지 못했습니다: {p0}',
    checkStatus: '상태 확인 필요',
    couldNotUndo2: '되돌리지 못했습니다.',
    andMoreLocations: '외 {p0}곳',
    processing: '처리 중…',
    open: '열기',
    viewLocation: '위치 보기',
    processing2: '처리 중…',
    undo: '되돌리기',
  },
  selectionEvidence: {
    skillActivatedByKeyword: '키워드로 켜진 Skill: {p0}',
    skillActivatedByKeywordFollowedModelSuggestion:
      '키워드로 켜진 Skill: {p0} · 다른 키워드 Skill과 워크플로가 달라 모델 제안을 따름',
    agreementKeywordModelSuggestionInformedBySelected:
      '협정문 키워드 · 선택 파일 크기 정보를 받은 모델 제안',
    modelSuggestionNoKeywordMatch: '모델 제안 · 키워드로 연결되지 않음',
    modelSuggestionNoWorkflowSelected: '모델 제안 · 워크플로가 선택되지 않음',
  },
  QueryProgress: {
    readingMentioned: '언급된 파일 읽는 중',
    indexingFiles: '파일 {p0}개 색인 중',
    chunksIndexed: '청크 {p0}/{p1}개 색인 완료',
    waitingRateLimit: '요청 한도 초기화 대기 중...',
    queryingVault: 'Vault 검색 중',
    expandingNotes: '관련 노트 확장 중',
    followingLinks: '위키링크와 백링크 추적 중',
    readingRelated: '관련 파일 읽는 중',
    rank: '순위',
    lLMIsThinkingAttempt: 'LLM이 답변을 생각하는 중입니다... (시도 {p0})',
    runningToolAttempt: "도구 '{p0}' 실행 중... (시도 {p1})",
    largeDocumentConversion: '대용량 문서 변환',
    wholeDocumentAnalysis: '전체 문서 분석',
    reviewBySection: '구간별 검토',
    crossSectionSynthesis: '교차 통합',
    crossCheckOmissionsAndContradictions: '누락·모순 교차 검증',
    convertBySection: '구간별 변환',
    inProgress: '{p0} 중: {p1}',
  },
}
